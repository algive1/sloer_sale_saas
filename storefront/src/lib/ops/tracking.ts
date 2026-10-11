import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { OpsTrackingQueueDocument, OpsTrackingOrdersDocument, OpsUpdateTrackingDocument, type OpsTrackingOrderFragment, type OpsTrackingQueueQuery, type OpsTrackingOrdersQuery, type OpsUpdateTrackingMutation } from "@/gql/graphql";
import { analyticsDatabaseConfigured, hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { fulfillmentScope } from "@/lib/ops/fulfillment";
import { parseTrackingCsv, type TrackingInput, type TrackingCheck, type TrackingPreview, type TrackingResult } from "@/lib/ops/tracking-csv";
import type { OpsViewer } from "@/lib/ops/authorization";

const PREVIEW_SCHEMA = "CREATE TABLE IF NOT EXISTS ops_tracking_previews(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,channel TEXT NOT NULL,actor TEXT NOT NULL,expires_at TEXT NOT NULL,input_digest TEXT NOT NULL)";
const ATTEMPT_SCHEMA = "CREATE TABLE IF NOT EXISTS ops_tracking_attempts(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,channel TEXT NOT NULL,actor TEXT NOT NULL,order_id TEXT NOT NULL,fulfillment_id TEXT NOT NULL,tracking_digest TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT)";
const CLAIM_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS ops_tracking_active_claim ON ops_tracking_attempts(site_id,fulfillment_id) WHERE state IN ('sending','applied','uncertain')";
const schema = [{ sql: PREVIEW_SCHEMA }, { sql: ATTEMPT_SCHEMA }, { sql: CLAIM_INDEX }];
export type TrackingQueue = { siteId: string; channel: string; checkedAt: string; nextCursor: string | null; rows: Array<{ orderId: string; orderNumber: string; fulfillmentId: string; trackingNumber: string }> };
function adminScope(siteId: string, viewer: OpsViewer | null, channel?: string) {
  if (viewer?.role !== "platform_admin" || viewer.username === "analytics") throw new Error("individual_admin_required");
  return fulfillmentScope(siteId, viewer, channel);
}
function configured() {
  // Mutations never borrow the broad fallback SALEOR_APP_TOKEN.
  if (!process.env.OPS_FULFILLMENT_SALEOR_TOKEN?.trim()) throw new Error("tracking_credential_required");
  if (!analyticsDatabaseConfigured()) throw new Error("tracking_audit_required");
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function source<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = process.env.OPS_FULFILLMENT_SALEOR_TOKEN?.trim();
  const url = (process.env.SALEOR_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SALEOR_API_URL)?.trim();
  if (!token || !url) throw new Error("tracking_credential_required");
  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(5_000), headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error("tracking_source_unavailable");
  const body = await response.json() as { data?: T; errors?: unknown[] };
  if (!body.data || body.errors?.length) throw new Error("tracking_source_unavailable");
  return body.data;
}
function activePhysical(order: OpsTrackingOrderFragment, fulfillmentId: string): boolean {
  const fulfillment = order.fulfillments?.find(row => row.id === fulfillmentId);
  return order.isPaid && order.isShippingRequired && ["FULFILLED", "PARTIALLY_FULFILLED"].includes(order.status)
    && fulfillment?.status === "FULFILLED" && !!fulfillment.lines?.length
    && fulfillment.lines.every(line => line.quantity > 0 && line.orderLine != null)
    && fulfillment.lines.some(line => line.orderLine?.isShippingRequired);
}
export async function readTrackingQueue(siteId: string, viewer: OpsViewer | null, requestedChannel?: string, after?: string): Promise<TrackingQueue> {
  const { channel } = adminScope(siteId, viewer, requestedChannel);
  if (after && (after.length > 256 || !/^[A-Za-z0-9+/=_-]+$/.test(after))) throw new Error("invalid_tracking_cursor");
  const result = await source<OpsTrackingQueueQuery>(OpsTrackingQueueDocument.toString(), { channel, after: after ?? null });
  if (!result.orders) throw new Error("tracking_source_unavailable");
  const rows: TrackingQueue["rows"] = [];
  for (const { node: order } of result.orders.edges) {
    if (order.channel.slug !== channel) throw new Error("tracking_source_scope_mismatch");
    for (const fulfillment of order.fulfillments ?? []) if (activePhysical(order, fulfillment.id)) rows.push({ orderId: order.id, orderNumber: order.number, fulfillmentId: fulfillment.id, trackingNumber: fulfillment.trackingNumber });
  }
  return { siteId, channel, checkedAt: new Date().toISOString(), rows, nextCursor: result.orders.pageInfo.hasNextPage ? result.orders.pageInfo.endCursor ?? null : null };
}
async function checkRows(channel: string, rows: TrackingInput[]): Promise<TrackingCheck[]> {
  const ids = [...new Set(rows.map(row => row.orderId))];
  const result = await source<OpsTrackingOrdersQuery>(OpsTrackingOrdersDocument.toString(), { channel, ids });
  const orders = result.orders?.edges.map(edge => edge.node);
  if (!orders || new Set(orders.map(order => order.id)).size !== orders.length || orders.some(order => order.channel.slug !== channel || !ids.includes(order.id))) throw new Error("tracking_source_scope_mismatch");
  return rows.map(row => {
    const order = orders.find(order => order.id === row.orderId);
    const fulfillment = order?.fulfillments?.find(fulfillment => fulfillment.id === row.fulfillmentId);
    const status: TrackingCheck["status"] = !order || !fulfillment ? "missing" : !activePhysical(order, row.fulfillmentId) ? "ineligible"
      : fulfillment.trackingNumber === row.trackingNumber ? "already_applied" : fulfillment.trackingNumber ? "conflict" : "ready";
    return { ...row, orderNumber: order?.number ?? null, status };
  });
}
export async function previewTrackingCsv(siteId: string, viewer: OpsViewer | null, channel: string, csv: string): Promise<TrackingPreview> {
  adminScope(siteId, viewer, channel); configured();
  const rows = parseTrackingCsv(csv);
  const checks = await checkRows(channel, rows);
  const id = randomUUID(); const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const result = await libsqlPipeline([...schema,
    { sql: "DELETE FROM ops_tracking_previews WHERE expires_at<?", args: [new Date().toISOString()] },
    { sql: "INSERT INTO ops_tracking_previews(id,site_id,channel,actor,expires_at,input_digest) VALUES (?,?,?,?,?,?)", args: [id, siteId, channel, viewer!.username, expiresAt, digest(rows)] }]);
  if (result.at(-1)?.affected_row_count !== 1) throw new Error("tracking_audit_unavailable");
  return { id, expiresAt, rows: checks, canSubmit: checks.every(row => row.status === "ready" || row.status === "already_applied") };
}
async function finish(id: string, state: string, reason: string): Promise<void> {
  const result = await libsqlPipeline([{ sql: "UPDATE ops_tracking_attempts SET state=?,reason=?,finished_at=? WHERE id=? AND state IN ('sending','uncertain')", args: [state, reason, new Date().toISOString(), id] }]);
  if (result[0]?.affected_row_count !== 1) throw new Error("tracking_audit_unavailable");
}
async function applyRow(siteId: string, channel: string, viewer: OpsViewer, row: TrackingInput): Promise<TrackingResult> {
  const id = randomUUID(); const trackingDigest = digest(row.trackingNumber);
  const result = await libsqlPipeline([{ sql: "INSERT OR IGNORE INTO ops_tracking_attempts(id,site_id,channel,actor,order_id,fulfillment_id,tracking_digest,state,reason,started_at) VALUES (?,?,?,?,?,?,?,'sending','claimed',?)", args: [id, siteId, channel, viewer.username, row.orderId, row.fulfillmentId, trackingDigest, new Date().toISOString()] }]);
  if (result[0]?.affected_row_count !== 1) {
    const records = await libsqlPipeline([{ sql: "SELECT id,channel,order_id,tracking_digest,state FROM ops_tracking_attempts WHERE site_id=? AND fulfillment_id=? AND state IN ('sending','applied','uncertain')", args: [siteId, row.fulfillmentId], wantRows: true }]);
    const prior = hranaRowsToObjects(records[0])[0];
    // Never resend an ambiguous mutation. A fresh native match may reconcile it.
    if (prior?.channel === channel && prior.order_id === row.orderId && prior.tracking_digest === trackingDigest) {
      const [fresh] = await checkRows(channel, [row]);
      if (fresh.status === "already_applied") {
        if (prior.state !== "applied") await finish(String(prior.id), "applied", "native_reconciled");
        return { ...row, status: "already_applied", reason: "native_reconciled", attemptId: String(prior.id) };
      }
      return { ...row, status: prior.state === "applied" ? "conflict" : "uncertain", reason: "claim_requires_native_review", attemptId: String(prior.id) };
    }
    return { ...row, status: "conflict", reason: "different_active_claim", attemptId: prior ? String(prior.id) : null };
  }
  let fresh: TrackingCheck;
  try { [fresh] = await checkRows(channel, [row]); } catch {
    await finish(id, "rejected", "source_check_failed");
    return { ...row, status: "rejected", reason: "source_check_failed", attemptId: id };
  }
  if (fresh.status === "already_applied") {
    await finish(id, "applied", "native_already_matches");
    return { ...row, status: "already_applied", reason: "native_already_matches", attemptId: id };
  }
  if (fresh.status !== "ready") {
    await finish(id, "rejected", "native_changed");
    return { ...row, status: "rejected", reason: "native_changed", attemptId: id };
  }
  try {
    // Saleor's native API has no expected-version/CAS field. The fresh check
    // blocks observed conflicts; Core Dashboard concurrent writes remain a
    // documented operational limitation. Do not claim an atomic global lock.
    const response = await source<OpsUpdateTrackingMutation>(OpsUpdateTrackingDocument.toString(), { id: row.fulfillmentId, trackingNumber: row.trackingNumber });
    const payload = response.orderFulfillmentUpdateTracking;
    if (payload?.errors.length && !payload.fulfillment) {
      await finish(id, "rejected", "native_rejected");
      return { ...row, status: "rejected", reason: "native_rejected", attemptId: id };
    }
    if (!payload || payload.errors.length || payload.fulfillment?.id !== row.fulfillmentId || payload.fulfillment.status !== "FULFILLED" || payload.fulfillment.trackingNumber !== row.trackingNumber || payload.order?.id !== row.orderId || payload.order.channel.slug !== channel) throw new Error("uncertain_receipt");
    await finish(id, "applied", "native_confirmed");
    return { ...row, status: "applied", reason: "native_confirmed", attemptId: id };
  } catch {
    // Includes lost acknowledgements after Core committed and audit failures.
    // If this update fails too, the durable 'sending' claim still blocks retry.
    try { await finish(id, "uncertain", "receipt_requires_native_review"); } catch { /* Preserve claim */ }
    return { ...row, status: "uncertain", reason: "receipt_requires_native_review", attemptId: id };
  }
}
export async function commitTrackingCsv(siteId: string, viewer: OpsViewer | null, channel: string, csv: string, previewId: string): Promise<{ rows: TrackingResult[] }> {
  adminScope(siteId, viewer, channel); configured();
  const rows = parseTrackingCsv(csv);
  if (!/^[a-f0-9-]{36}$/.test(previewId)) throw new Error("invalid_tracking_preview");
  const records = await libsqlPipeline([...schema, { sql: "SELECT input_digest,expires_at FROM ops_tracking_previews WHERE id=? AND site_id=? AND channel=? AND actor=?", args: [previewId, siteId, channel, viewer!.username], wantRows: true }]);
  const preview = hranaRowsToObjects(records.at(-1))[0];
  if (!preview || preview.input_digest !== digest(rows) || String(preview.expires_at) <= new Date().toISOString()) throw new Error("tracking_preview_expired_or_changed");
  const checks = await checkRows(channel, rows);
  if (checks.some(row => !["ready", "already_applied"].includes(row.status))) throw new Error("tracking_orders_changed_reload");
  const output: TrackingResult[] = [];
  for (const row of rows) {
    try { const result = await applyRow(siteId, channel, viewer!, row); output.push(result); if (result.status === "uncertain") break; }
    catch { output.push({ ...row, status: "uncertain", reason: "audit_or_source_requires_review", attemptId: null }); break; }
  }
  for (const row of rows.slice(output.length)) output.push({ ...row, status: "rejected", reason: "batch_stopped_before_attempt", attemptId: null });
  return { rows: output };
}
export async function trackingHistory(siteId: string, viewer: OpsViewer | null, requestedChannel?: string) {
  const { channel } = adminScope(siteId, viewer, requestedChannel);
  if (!analyticsDatabaseConfigured()) return null;
  const results = await libsqlPipeline([...schema, { sql: "SELECT id,actor,order_id,fulfillment_id,state,reason,started_at FROM ops_tracking_attempts WHERE site_id=? AND channel=? ORDER BY started_at DESC LIMIT 30", args: [siteId, channel], wantRows: true }]);
  return hranaRowsToObjects(results.at(-1)).map(row => ({ id: String(row.id), actor: String(row.actor), orderId: String(row.order_id), fulfillmentId: String(row.fulfillment_id), state: String(row.state), reason: String(row.reason), startedAt: String(row.started_at) }));
}
