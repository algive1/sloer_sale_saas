import "server-only";

import { ensureAnalyticsSchema } from "@/lib/analytics/first-party-store";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/analytics/libsql-http";
import type { TrafficBucket } from "@/lib/analytics/traffic-report";

export type OverviewRange = { from: Date; to: Date; bucket: TrafficBucket };
export type MoneyPart = { currency: string; value: number };

export type OverviewSource = {
  country: string;
  source: string;
  trafficType: string;
  sessions: number;
  carts: number;
  orders: number;
  purchaseSessions: number;
  revenueByCurrency: MoneyPart[];
};

export type OverviewFinance = {
  bucket: string;
  country: string;
  currency: string;
  gross: number;
  refunds: number;
  orders: number;
};

export type OverviewProductTraffic = {
  itemKey: string;
  trafficType: string;
  views: number;
  purchases: number;
};

export type OverviewDetails = {
  sources: OverviewSource[];
  products: OverviewProductTraffic[];
};

const scopedEvents = [
  "WITH base AS (SELECT *,",
  "COALESCE(NULLIF(country_code, ''), 'UNKNOWN') AS geo,",
  "COALESCE(NULLIF(source_group, ''), NULLIF(source, ''), 'direct') AS source_key,",
  "COALESCE(NULLIF(traffic_type, ''), 'other') AS type_key",
  "FROM analytics_events WHERE occurred_at >= ? AND occurred_at < ?",
  "AND COALESCE(device_type, '') != 'bot'),",
  "scoped AS (SELECT 'ALL' AS country, * FROM base",
  "UNION ALL SELECT geo AS country, * FROM base)"
].join(" ");

const sourceSql = [
  scopedEvents,
  "SELECT country, source_key AS source, type_key AS traffic_type,",
  "COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,",
  "COUNT(DISTINCT CASE WHEN event_name = 'product_added_to_cart'",
  "THEN COALESCE(session_id, event_id) END) AS carts,",
  "SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS orders,",
  "COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed'",
  "THEN COALESCE(session_id, event_id) END) AS purchase_sessions",
  "FROM scoped GROUP BY country, source_key, type_key",
  "ORDER BY sessions DESC LIMIT 500"
].join(" ");

const sourceRevenueSql = [
  scopedEvents,
  "SELECT country, source_key AS source, type_key AS traffic_type,",
  "COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,",
  "SUM(CASE WHEN event_name = 'checkout_completed' THEN COALESCE(value,0)",
  "WHEN event_name = 'refund_completed' THEN -COALESCE(value,0)",
  "ELSE 0 END) AS net_revenue",
  "FROM scoped WHERE event_name IN ('checkout_completed', 'refund_completed')",
  "GROUP BY country, source_key, type_key, COALESCE(NULLIF(currency, ''), 'UNKNOWN')"
].join(" ");

const productSql = [
  "SELECT COALESCE(NULLIF(ai.variant_id, ''), ai.item_id) AS item_key,",
  "COALESCE(NULLIF(ae.traffic_type, ''), 'other') AS traffic_type,",
  "COUNT(DISTINCT CASE WHEN ae.event_name = 'product_viewed'",
  "THEN COALESCE(ae.session_id, ae.event_id) END) AS views,",
  "COUNT(DISTINCT CASE WHEN ae.event_name = 'checkout_completed'",
  "THEN COALESCE(ae.session_id, ae.event_id) END) AS purchases",
  "FROM analytics_event_items ai JOIN analytics_events ae",
  "ON ae.event_name = ai.event_name AND ae.event_id = ai.event_id",
  "WHERE ae.occurred_at >= ? AND ae.occurred_at < ?",
  "AND COALESCE(ae.device_type, '') != 'bot'",
  "GROUP BY item_key, traffic_type ORDER BY views DESC LIMIT 1000"
].join(" ");

export async function readOverviewDetails(range: OverviewRange): Promise<OverviewDetails> {
  await ensureAnalyticsSchema();
  const dates = [range.from.toISOString(), range.to.toISOString()];
  const [sourceRows, revenueRows, productRows] = await libsqlPipeline([
    { sql: sourceSql, args: dates, wantRows: true },
    { sql: sourceRevenueSql, args: dates, wantRows: true },
    { sql: productSql, args: dates, wantRows: true },
  ]);
  const money = new Map<string, MoneyPart[]>();
  const keyOf = (country: string, source: string, type: string) =>
    JSON.stringify([country, source, type]);
  for (const row of hranaRowsToObjects(revenueRows)) {
    const key = keyOf(String(row.country), String(row.source), String(row.traffic_type));
    const list = money.get(key) ?? [];
    list.push({ currency: String(row.currency), value: Number(row.net_revenue ?? 0) });
    money.set(key, list);
  }
  return {
    sources: hranaRowsToObjects(sourceRows).map((row) => {
      const country = String(row.country ?? "UNKNOWN");
      const source = String(row.source ?? "direct");
      const trafficType = String(row.traffic_type ?? "other");
      return {
        country, source, trafficType,
        sessions: Number(row.sessions ?? 0),
        carts: Number(row.carts ?? 0),
        orders: Number(row.orders ?? 0),
        purchaseSessions: Number(row.purchase_sessions ?? 0),
        revenueByCurrency: money.get(keyOf(country, source, trafficType)) ?? [],
      };
    }),
    products: hranaRowsToObjects(productRows).map((row) => ({
      itemKey: String(row.item_key ?? ""),
      trafficType: String(row.traffic_type ?? "other"),
      views: Number(row.views ?? 0),
      purchases: Number(row.purchases ?? 0),
    })),
  };
}

export async function readOverviewFinances(range: OverviewRange): Promise<OverviewFinance[]> {
  await ensureAnalyticsSchema();
  const period = range.bucket === "hour"
    ? "substr(occurred_at, 1, 13) || ':00'"
    : "substr(occurred_at, 1, 10)";
  const financeSql = [
    scopedEvents,
    "SELECT",
    period, "AS bucket, country,",
    "COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,",
    "SUM(CASE WHEN event_name = 'checkout_completed' THEN COALESCE(value,0) ELSE 0 END) AS gross,",
    "SUM(CASE WHEN event_name = 'refund_completed' THEN COALESCE(value,0) ELSE 0 END) AS refunds,",
    "SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS orders",
    "FROM scoped WHERE event_name IN ('checkout_completed','refund_completed')",
    "GROUP BY bucket, country, currency ORDER BY bucket ASC"
  ].join(" ");
  const [result] = await libsqlPipeline([{
    sql: financeSql,
    args: [range.from.toISOString(), range.to.toISOString()],
    wantRows: true,
  }]);
  return hranaRowsToObjects(result).map((row) => ({
    bucket: String(row.bucket ?? ""),
    country: String(row.country ?? "ALL"),
    currency: String(row.currency ?? "UNKNOWN"),
    gross: Number(row.gross ?? 0),
    refunds: Number(row.refunds ?? 0),
    orders: Number(row.orders ?? 0),
  }));
}
