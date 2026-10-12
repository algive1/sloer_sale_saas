import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getBrandSites } from "@/config/brand-sites";
import { OpsFulfillmentQueueDocument, OpsShippingExportOrdersDocument, type OpsFulfillmentOrderFragment, type OpsFulfillmentQueueQuery, type OpsShippingExportOrdersQuery } from "@/gql/graphql";
import { analyticsDatabaseConfigured, hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { csvFile } from "./catalog-csv";
import type { OpsViewer } from "./authorization";

const EXPORT_SCHEMA = "CREATE TABLE IF NOT EXISTS ops_shipping_exports(id TEXT PRIMARY KEY,site_id TEXT NOT NULL,channel TEXT NOT NULL,actor TEXT NOT NULL,prepared_at TEXT NOT NULL,order_count INTEGER NOT NULL,row_count INTEGER NOT NULL,order_ids_digest TEXT NOT NULL)";

export type FulfillmentQueueOrder = Pick<OpsFulfillmentOrderFragment, "id" | "number" | "created" | "status" | "isPaid" | "isShippingRequired" | "lines" | "fulfillments"> & { channel: string; shippingReady: boolean; exportable: boolean };
export type FulfillmentSnapshot = { siteId: string; siteName: string; channel: string; channels: readonly string[]; checkedAt: string; nextCursor: string | null; orders: FulfillmentQueueOrder[] };
export function fulfillmentScope(siteId: string, viewer: OpsViewer | null, requestedChannel?: string) {
  if (!viewer || (viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) throw new Error("forbidden_fulfillment");
  const site = getBrandSites()?.find(site => site.id === siteId);
  if (!site) throw new Error("unknown_fulfillment_brand");
  const channel = requestedChannel ?? site.defaultChannel;
  if (!site.channels.includes(channel)) throw new Error("invalid_fulfillment_market");
  return { site, channel };
}
async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = (process.env.OPS_FULFILLMENT_SALEOR_TOKEN || process.env.SALEOR_APP_TOKEN)?.trim();
  const url = (process.env.SALEOR_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SALEOR_API_URL)?.trim();
  if (!token || !url) throw new Error("fulfillment_source_not_configured");
  const response = await fetch(url, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error("fulfillment_source_unavailable");
  const body = await response.json() as { data?: T; errors?: unknown[] };
  if (!body.data || body.errors?.length) throw new Error("fulfillment_source_unavailable");
  return body.data;
}
export function shippingEligible(order: OpsFulfillmentOrderFragment): boolean {
  return order.isPaid && ["UNFULFILLED", "PARTIALLY_FULFILLED"].includes(order.status) && order.isShippingRequired && !!order.shippingAddress
    && order.lines.some(line => line.isShippingRequired && line.quantityToFulfill > 0);
}
export function publicFulfillmentOrder(order: OpsFulfillmentOrderFragment, channel: string): FulfillmentQueueOrder {
  if (order.channel.slug !== channel) throw new Error("fulfillment_source_scope_mismatch");
  // Do not pass the spread of a credential/PII-bearing upstream object to UI/API.
  return { id: order.id, number: order.number, created: order.created, status: order.status, isPaid: order.isPaid,
    isShippingRequired: order.isShippingRequired,
    lines: order.lines.map(line => ({ id: line.id, productName: line.productName, productSku: line.productSku, quantity: line.quantity, quantityFulfilled: line.quantityFulfilled, quantityToFulfill: line.quantityToFulfill, isShippingRequired: line.isShippingRequired })),
    fulfillments: order.fulfillments?.map(item => ({ id: item.id, status: item.status, trackingNumber: item.trackingNumber, created: item.created })), channel, shippingReady: shippingEligible(order), exportable: shippingEligible(order) && order.lines
      .filter(line => line.isShippingRequired && line.quantityToFulfill > 0).every(line => !!line.productSku?.trim()) };
}
export async function readFulfillmentSnapshot(siteId: string, viewer: OpsViewer | null, requestedChannel?: string, after?: string): Promise<FulfillmentSnapshot> {
  const { site, channel } = fulfillmentScope(siteId, viewer, requestedChannel);
  if (after && (after.length > 256 || !/^[A-Za-z0-9+/=_-]+$/.test(after))) throw new Error("invalid_fulfillment_cursor");
  const result = await graphql<OpsFulfillmentQueueQuery>(OpsFulfillmentQueueDocument.toString(), { channel, after: after ?? null });
  if (!result.orders) throw new Error("fulfillment_source_unavailable");
  return { siteId, siteName: site.name, channel, channels: site.channels, checkedAt: new Date().toISOString(),
    nextCursor: result.orders.pageInfo.hasNextPage ? result.orders.pageInfo.endCursor ?? null : null,
    orders: result.orders.edges.map(edge => publicFulfillmentOrder(edge.node, channel)) };
}

export async function exportShippingCsv(siteId: string, viewer: OpsViewer | null, requestedChannel: string, ids: unknown): Promise<{ csv: string; rows: number; exportId: string }> {
  if (viewer?.role !== "platform_admin" || viewer.username === "analytics") throw new Error("individual_admin_required");
  const { channel } = fulfillmentScope(siteId, viewer, requestedChannel);
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 25 || ids.some(id => typeof id !== "string" || id.length > 300 || !/^[A-Za-z0-9+/=_-]+$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("invalid_export_selection");
  if (!analyticsDatabaseConfigured()) throw new Error("export_audit_storage_required");
  const result = await graphql<OpsShippingExportOrdersQuery>(OpsShippingExportOrdersDocument.toString(), { channel, ids });
  const orders = result.orders?.edges.map(edge => edge.node);
  if (!orders || orders.length !== ids.length || new Set(orders.map(order => order.id)).size !== ids.length || orders.some(order => !ids.includes(order.id) || order.channel.slug !== channel || !shippingEligible(order))) throw new Error("export_orders_changed_reload");
  const rows: Array<Array<string | number>> = [["order_id", "order_number", "channel", "order_line_id", "sku", "product_name", "quantity_to_ship", "order_total_weight", "weight_unit", "recipient", "company", "country", "region", "city", "city_area", "postal_code", "street_1", "street_2", "phone"]];
  for (const order of orders) {
    const address = order.shippingAddress!;
    if ((!address.firstName.trim() && !address.lastName.trim()) || !address.streetAddress1.trim() || !address.city.trim() || !address.country.code) throw new Error("export_address_incomplete");
    for (const line of order.lines.filter(line => line.isShippingRequired && line.quantityToFulfill > 0)) {
      if (!line.productSku?.trim()) throw new Error("export_sku_incomplete");
      rows.push([order.id, order.number, channel, line.id, line.productSku ?? "", line.productName, line.quantityToFulfill, order.weight.value, order.weight.unit,
        `${address.firstName} ${address.lastName}`.trim(), address.companyName, address.country.code, address.countryArea, address.city, address.cityArea, address.postalCode, address.streetAddress1, address.streetAddress2, address.phone ?? ""]);
    }
  }
  if (rows.length > 501) throw new Error("export_too_many_lines_use_smaller_batch");
  const exportId = randomUUID();
  const auditResult = await libsqlPipeline([{ sql: EXPORT_SCHEMA },
    { sql: "INSERT INTO ops_shipping_exports(id,site_id,channel,actor,prepared_at,order_count,row_count,order_ids_digest) VALUES (?,?,?,?,?,?,?,?)", args: [exportId, siteId, channel, viewer.username, new Date().toISOString(), orders.length, rows.length - 1, createHash("sha256").update(JSON.stringify([...ids].sort())).digest("hex")] }]);
  if (auditResult.at(-1)?.affected_row_count !== 1) throw new Error("export_audit_write_failed");
  return { csv: csvFile(rows), rows: rows.length - 1, exportId };
}
export async function shippingExportHistory(siteId: string, viewer: OpsViewer | null, requestedChannel?: string) {
  const { channel } = fulfillmentScope(siteId, viewer, requestedChannel);
  if (viewer?.role !== "platform_admin") throw new Error("individual_admin_required");
  if (!analyticsDatabaseConfigured()) return null;
  const [,result] = await libsqlPipeline([{ sql: EXPORT_SCHEMA }, { sql: "SELECT id,channel,actor,prepared_at,order_count,row_count FROM ops_shipping_exports WHERE site_id=? AND channel=? ORDER BY prepared_at DESC LIMIT 20", args: [siteId, channel], wantRows: true }]);
  return hranaRowsToObjects(result).map(row => ({ id: String(row.id), channel: String(row.channel), actor: String(row.actor), preparedAt: String(row.prepared_at), orderCount: Number(row.order_count), rowCount: Number(row.row_count) }));
}
