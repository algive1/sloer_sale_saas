import "server-only";
import { createHash } from "node:crypto";
import { analyticsDatabaseConfigured, hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import type { AdDestination } from "./server-config";

export type DeliveryResult = { status: "transport_accepted" | "provider_accepted" | "failed" | "unconfirmed"; code: string };
export type AdDeliveryRecord = { destination: string; destinationId: string; eventName: string; channel: string; status: string; code: string; claimedAt: string; finishedAt: string };

let schemaPromise: Promise<unknown> | null = null;
async function schema() {
  schemaPromise ??= libsqlPipeline([{
    sql: `CREATE TABLE IF NOT EXISTS analytics_ad_deliveries (
      site_id TEXT NOT NULL, destination TEXT NOT NULL, event_key TEXT NOT NULL,
      destination_id TEXT NOT NULL, event_name TEXT NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', claimed_at TEXT NOT NULL,
      finished_at TEXT, PRIMARY KEY(site_id, destination, event_key))`,
  }]).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

export async function claimAdDelivery(siteId: string, destination: AdDestination, destinationId: string, eventName: string, channel: string, eventId: string): Promise<boolean> {
  if (!eventId || eventId.length > 256) return false;
  if (!analyticsDatabaseConfigured()) return siteId === "legacy:single";
  await schema();
  const key = createHash("sha256").update(eventName + ":" + eventId).digest("hex");
  const [result] = await libsqlPipeline([{
    sql: `INSERT OR IGNORE INTO analytics_ad_deliveries
      (site_id, destination, event_key, destination_id, event_name, channel, status, claimed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'sending', ?)`,
    args: [siteId, destination, key, destinationId, eventName, channel, new Date().toISOString()],
  }]);
  return result?.affected_row_count === 1;
}

export async function finishAdDelivery(siteId: string, destination: AdDestination, eventName: string, eventId: string, result: DeliveryResult) {
  if (!analyticsDatabaseConfigured()) return;
  const key = createHash("sha256").update(eventName + ":" + eventId).digest("hex");
  await libsqlPipeline([{
    sql: "UPDATE analytics_ad_deliveries SET status = ?, code = ?, finished_at = ? WHERE site_id = ? AND destination = ? AND event_key = ? AND status = 'sending'",
    args: [result.status, result.code, new Date().toISOString(), siteId, destination, key],
  }]);
}

export async function readAdDeliveries(siteId: string): Promise<AdDeliveryRecord[]> {
  if (!analyticsDatabaseConfigured()) throw new Error("ad_delivery_storage_unavailable");
  await schema();
  const [result] = await libsqlPipeline([{
    sql: "SELECT destination, destination_id, event_name, channel, status, code, claimed_at, finished_at FROM analytics_ad_deliveries WHERE site_id = ? ORDER BY claimed_at DESC LIMIT 40",
    args: [siteId], wantRows: true,
  }]);
  return hranaRowsToObjects(result).map(row => ({ destination: String(row.destination), destinationId: String(row.destination_id),
    eventName: String(row.event_name), channel: String(row.channel), status: String(row.status), code: String(row.code),
    claimedAt: String(row.claimed_at), finishedAt: String(row.finished_at ?? "") }));
}
