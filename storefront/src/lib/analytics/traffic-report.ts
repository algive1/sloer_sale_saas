import "server-only";

import { ensureAnalyticsSchema } from "@/lib/analytics/first-party-store";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/analytics/libsql-http";

export type TrafficBucket = "hour" | "day";

export type TrafficReport = {
	sessions: number;
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
	countries: Array<{
		countryCode: string;
		sessions: number;
		paid: number;
		organic: number;
		purchases: number;
	}>;
	sources: Array<{
		source: string;
		trafficType: string;
		sessions: number;
		purchases: number;
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

	const [totalResult, typeResult, trendResult, countryResult, sourceResult] = await libsqlPipeline([
		{
			sql: `SELECT COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${typeExpr} AS traffic_type,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${typeExpr}
				ORDER BY sessions DESC`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${bucketExpr} AS bucket,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS total,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'paid' THEN COALESCE(session_id, event_id) END) AS paid,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'organic' THEN COALESCE(session_id, event_id) END) AS organic,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'direct' THEN COALESCE(session_id, event_id) END) AS direct,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'referral' THEN COALESCE(session_id, event_id) END) AS referral,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'other' THEN COALESCE(session_id, event_id) END) AS other
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${bucketExpr}
				ORDER BY bucket ASC`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT COALESCE(NULLIF(country_code, ''), 'UNKNOWN') AS country_code,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'paid' THEN COALESCE(session_id, event_id) END) AS paid,
				COUNT(DISTINCT CASE WHEN ${typeExpr} = 'organic' THEN COALESCE(session_id, event_id) END) AS organic,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS purchases
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY COALESCE(NULLIF(country_code, ''), 'UNKNOWN')
				ORDER BY sessions DESC
				LIMIT 20`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${sourceExpr} AS source,
				${typeExpr} AS traffic_type,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS purchases
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${sourceExpr}, ${typeExpr}
				ORDER BY sessions DESC
				LIMIT 30`,
			args: [from, to],
			wantRows: true,
		},
	]);

	const totalRow = hranaRowsToObjects(totalResult)[0] ?? {};
	return {
		sessions: Number(totalRow.sessions ?? 0),
		byType: hranaRowsToObjects(typeResult).map((row) => ({
			trafficType: String(row.traffic_type ?? "direct"),
			sessions: Number(row.sessions ?? 0),
		})),
		trend: hranaRowsToObjects(trendResult).map((row) => ({
			bucket: String(row.bucket ?? ""),
			total: Number(row.total ?? 0),
			paid: Number(row.paid ?? 0),
			organic: Number(row.organic ?? 0),
			direct: Number(row.direct ?? 0),
			referral: Number(row.referral ?? 0),
			other: Number(row.other ?? 0),
		})),
		countries: hranaRowsToObjects(countryResult).map((row) => ({
			countryCode: String(row.country_code ?? "UNKNOWN"),
			sessions: Number(row.sessions ?? 0),
			paid: Number(row.paid ?? 0),
			organic: Number(row.organic ?? 0),
			purchases: Number(row.purchases ?? 0),
		})),
		sources: hranaRowsToObjects(sourceResult).map((row) => ({
			source: String(row.source ?? "direct"),
			trafficType: String(row.traffic_type ?? "direct"),
			sessions: Number(row.sessions ?? 0),
			purchases: Number(row.purchases ?? 0),
		})),
	};
}
