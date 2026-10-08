import "server-only";

import { ensureAnalyticsSchema } from "@/plugins/analytics/first-party-store";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";

export type TrafficBucket = "hour" | "day";
export type MoneyTotal = { currency: string; value: number };

export type TrafficQualityRow = {
	source: string;
	trafficType: string;
	sessions: number;
	productViews: number;
	addToCarts: number;
	checkouts: number;
	purchaseSessions: number;
	orders: number;
	revenueByCurrency: MoneyTotal[];
};

export type CountryTrafficRow = {
	countryCode: string;
	sessions: number;
	paid: number;
	organic: number;
	productViews: number;
	addToCarts: number;
	checkouts: number;
	purchaseSessions: number;
	orders: number;
	revenueByCurrency: MoneyTotal[];
};

export type TrafficReport = {
	sessions: number;
	quality: {
		productViews: number;
		addToCarts: number;
		checkouts: number;
		purchaseSessions: number;
		orders: number;
	};
	byType: Array<{ trafficType: string; sessions: number }>;
	trend: Array<{
		bucket: string;
		total: number;
		paid: number;
		organic: number;
		direct: number;
		referral: number;
		other: number;
	}>;
	countries: CountryTrafficRow[];
	sources: TrafficQualityRow[];
	countryTrend: Array<{
		bucket: string;
		countryCode: string;
		sessions: number;
	}>;
};

export async function readTrafficReport(input: {
	from: Date;
	to: Date;
	bucket: TrafficBucket;
}): Promise<TrafficReport> {
	await ensureAnalyticsSchema();
	const from = input.from.toISOString();
	const to = input.to.toISOString();
	const bucketExpr =
		input.bucket === "hour"
			? "substr(occurred_at, 1, 13) || ':00'"
			: "substr(occurred_at, 1, 10)";
	const typeExpr = "COALESCE(NULLIF(traffic_type, ''), 'direct')";
	const sourceExpr = "COALESCE(NULLIF(source_group, ''), NULLIF(source, ''), 'direct')";
	const sessionExpr = "COALESCE(session_id, event_id)";
	const countryExpr = "COALESCE(NULLIF(country_code, ''), 'UNKNOWN')";

	const [
		totalResult,
		typeResult,
		trendResult,
		countryQualityResult,
		countryRevenueResult,
		sourceQualityResult,
		sourceRevenueResult,
		countryTrendResult,
	] = await libsqlPipeline([
		{
			sql: `SELECT COUNT(DISTINCT ${sessionExpr}) AS sessions,
				COUNT(DISTINCT CASE WHEN event_name = 'product_viewed' THEN ${sessionExpr} END) AS product_views,
				COUNT(DISTINCT CASE WHEN event_name = 'product_added_to_cart' THEN ${sessionExpr} END) AS add_to_carts,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_started' THEN ${sessionExpr} END) AS checkouts,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed' THEN ${sessionExpr} END) AS purchase_sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS orders
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${typeExpr} AS traffic_type,
				COUNT(DISTINCT ${sessionExpr}) AS sessions
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${typeExpr}
				ORDER BY sessions DESC`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${bucketExpr} AS bucket,
				COUNT(DISTINCT ${sessionExpr}) AS total,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'paid' THEN ${sessionExpr} END) AS paid,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'organic' THEN ${sessionExpr} END) AS organic,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'direct' THEN ${sessionExpr} END) AS direct,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'referral' THEN ${sessionExpr} END) AS referral,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'other' THEN ${sessionExpr} END) AS other
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${bucketExpr}
				ORDER BY bucket ASC`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${countryExpr} AS country_code,
				COUNT(DISTINCT ${sessionExpr}) AS sessions,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'paid' THEN ${sessionExpr} END) AS paid,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'organic' THEN ${sessionExpr} END) AS organic,
				COUNT(DISTINCT CASE WHEN event_name = 'product_viewed' THEN ${sessionExpr} END) AS product_views,
				COUNT(DISTINCT CASE WHEN event_name = 'product_added_to_cart' THEN ${sessionExpr} END) AS add_to_carts,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_started' THEN ${sessionExpr} END) AS checkouts,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed' THEN ${sessionExpr} END) AS purchase_sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS orders
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${countryExpr}
				ORDER BY sessions DESC
				LIMIT 20`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${countryExpr} AS country_code,
				COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,
				COALESCE(SUM(CASE
					WHEN event_name = 'checkout_completed' THEN value
					WHEN event_name = 'refund_completed' THEN -value
					ELSE 0 END), 0) AS revenue
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND COALESCE(device_type, '') != 'bot'
					AND event_name IN ('checkout_completed', 'refund_completed')
				GROUP BY ${countryExpr}, COALESCE(NULLIF(currency, ''), 'UNKNOWN')`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${sourceExpr} AS source,
				${typeExpr} AS traffic_type,
				COUNT(DISTINCT ${sessionExpr}) AS sessions,
				COUNT(DISTINCT CASE WHEN event_name = 'product_viewed' THEN ${sessionExpr} END) AS product_views,
				COUNT(DISTINCT CASE WHEN event_name = 'product_added_to_cart' THEN ${sessionExpr} END) AS add_to_carts,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_started' THEN ${sessionExpr} END) AS checkouts,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed' THEN ${sessionExpr} END) AS purchase_sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS orders
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${sourceExpr}, ${typeExpr}
				ORDER BY sessions DESC
				LIMIT 30`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${sourceExpr} AS source,
				${typeExpr} AS traffic_type,
				COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,
				COALESCE(SUM(CASE
					WHEN event_name = 'checkout_completed' THEN value
					WHEN event_name = 'refund_completed' THEN -value
					ELSE 0 END), 0) AS revenue
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND COALESCE(device_type, '') != 'bot'
					AND event_name IN ('checkout_completed', 'refund_completed')
				GROUP BY ${sourceExpr}, ${typeExpr}, COALESCE(NULLIF(currency, ''), 'UNKNOWN')`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `WITH top_countries AS (
				SELECT country_code
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND COALESCE(device_type, '') != 'bot'
					AND country_code IS NOT NULL AND country_code != ''
				GROUP BY country_code
				ORDER BY COUNT(DISTINCT ${sessionExpr}) DESC
				LIMIT 5
			)
			SELECT ${bucketExpr} AS bucket,
				country_code,
				COUNT(DISTINCT ${sessionExpr}) AS sessions
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at < ?
				AND COALESCE(device_type, '') != 'bot'
				AND country_code IN (SELECT country_code FROM top_countries)
			GROUP BY ${bucketExpr}, country_code
			ORDER BY bucket ASC, sessions DESC`,
			args: [from, to, from, to],
			wantRows: true,
		},
	]);

	const countryRevenue = moneyMap(
		hranaRowsToObjects(countryRevenueResult),
		(row) => String(row.country_code ?? "UNKNOWN"),
	);
	const sourceRevenue = moneyMap(
		hranaRowsToObjects(sourceRevenueResult),
		(row) => `${String(row.source ?? "direct")}:${String(row.traffic_type ?? "direct")}`,
	);

	const totalRow = hranaRowsToObjects(totalResult)[0] ?? {};
	return {
		sessions: Number(totalRow.sessions ?? 0),
		quality: {
			productViews: Number(totalRow.product_views ?? 0),
			addToCarts: Number(totalRow.add_to_carts ?? 0),
			checkouts: Number(totalRow.checkouts ?? 0),
			purchaseSessions: Number(totalRow.purchase_sessions ?? 0),
			orders: Number(totalRow.orders ?? 0),
		},
		byType: hranaRowsToObjects(typeResult).map((row) => ({
			trafficType: String(row.traffic_type ?? "direct"),
			sessions: Number(row.sessions ?? 0),
		})),
		trend: fillTrendGaps(
			hranaRowsToObjects(trendResult).map((row) => ({
				bucket: String(row.bucket ?? ""),
				total: Number(row.total ?? 0),
				paid: Number(row.paid ?? 0),
				organic: Number(row.organic ?? 0),
				direct: Number(row.direct ?? 0),
				referral: Number(row.referral ?? 0),
				other: Number(row.other ?? 0),
			})),
			input.from,
			input.to,
			input.bucket,
		),
		countries: hranaRowsToObjects(countryQualityResult).map((row) => {
			const countryCode = String(row.country_code ?? "UNKNOWN");
			return {
				countryCode,
				sessions: Number(row.sessions ?? 0),
				paid: Number(row.paid ?? 0),
				organic: Number(row.organic ?? 0),
				productViews: Number(row.product_views ?? 0),
				addToCarts: Number(row.add_to_carts ?? 0),
				checkouts: Number(row.checkouts ?? 0),
				purchaseSessions: Number(row.purchase_sessions ?? 0),
				orders: Number(row.orders ?? 0),
				revenueByCurrency: countryRevenue.get(countryCode) ?? [],
			};
		}),
		sources: hranaRowsToObjects(sourceQualityResult).map((row) => {
			const source = String(row.source ?? "direct");
			const trafficType = String(row.traffic_type ?? "direct");
			return {
				source,
				trafficType,
				sessions: Number(row.sessions ?? 0),
				productViews: Number(row.product_views ?? 0),
				addToCarts: Number(row.add_to_carts ?? 0),
				checkouts: Number(row.checkouts ?? 0),
				purchaseSessions: Number(row.purchase_sessions ?? 0),
				orders: Number(row.orders ?? 0),
				revenueByCurrency: sourceRevenue.get(`${source}:${trafficType}`) ?? [],
			};
		}),
		countryTrend: hranaRowsToObjects(countryTrendResult).map((row) => ({
			bucket: String(row.bucket ?? ""),
			countryCode: String(row.country_code ?? "UNKNOWN"),
			sessions: Number(row.sessions ?? 0),
		})),
	};
}

type TrafficTrendPoint = TrafficReport["trend"][number];

export function fillTrendGaps(
	rows: TrafficTrendPoint[],
	from: Date,
	to: Date,
	bucket: TrafficBucket,
): TrafficTrendPoint[] {
	if (to <= from) return [];
	const byBucket = new Map(rows.map((row) => [row.bucket, row]));
	const cursor = floorUtc(from, bucket);
	const last = floorUtc(new Date(to.getTime() - 1), bucket);
	const result: TrafficTrendPoint[] = [];

	while (cursor <= last) {
		const key = formatBucketKey(cursor, bucket);
		result.push(
			byBucket.get(key) ?? {
				bucket: key,
				total: 0,
				paid: 0,
				organic: 0,
				direct: 0,
				referral: 0,
				other: 0,
			},
		);
		if (bucket === "hour") cursor.setUTCHours(cursor.getUTCHours() + 1);
		else cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return result;
}

function moneyMap(
	rows: Array<Record<string, unknown>>,
	keyOf: (row: Record<string, unknown>) => string,
): Map<string, MoneyTotal[]> {
	const result = new Map<string, MoneyTotal[]>();
	for (const row of rows) {
		const key = keyOf(row);
		const list = result.get(key) ?? [];
		list.push({
			currency: String(row.currency ?? "UNKNOWN"),
			value: Number(row.revenue ?? 0),
		});
		result.set(key, list);
	}
	return result;
}

function floorUtc(date: Date, bucket: TrafficBucket): Date {
	if (bucket === "hour") {
		return new Date(Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate(),
			date.getUTCHours(),
		));
	}
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatBucketKey(date: Date, bucket: TrafficBucket): string {
	const iso = date.toISOString();
	return bucket === "hour" ? `${iso.slice(0, 13)}:00` : iso.slice(0, 10);
}
