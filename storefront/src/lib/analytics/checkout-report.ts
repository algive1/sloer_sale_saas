import "server-only";

import { ensureAnalyticsSchema } from "@/lib/analytics/first-party-store";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/analytics/libsql-http";

export type CheckoutBucket = "hour" | "day";

export type CheckoutReport = {
	summary: {
		started: number;
		purchaseSessions: number;
		orders: number;
		paymentFailures: number;
		checkoutFailures: number;
	};
	funnel: Array<{
		key: string;
		label: string;
		count: number;
	}>;
	trend: Array<{
		bucket: string;
		started: number;
		payment: number;
		purchases: number;
		paymentFailures: number;
	}>;
	abandonment: Array<{
		stage: string;
		count: number;
	}>;
	failures: Array<{
		kind: string;
		stage: string;
		provider: string;
		code: string;
		reason: string;
		sessions: number;
		occurrences: number;
	}>;
	paymentMethods: Array<{
		method: string;
		selectedSessions: number;
		purchaseSessions: number;
	}>;
	shippingMethods: Array<{
		method: string;
		selectedSessions: number;
		purchaseSessions: number;
	}>;
};

const FUNNEL_STAGES = [
	["checkout_started", "Checkout started"],
	["contact", "Contact"],
	["shipping", "Shipping"],
	["shipping_method_selected", "Shipping method"],
	["payment", "Payment"],
	["payment_method_selected", "Payment method"],
	["checkout_completed", "Purchase"],
] as const;

const ABANDONMENT_LABELS: Record<number, string> = {
	1: "Checkout started",
	2: "Contact",
	3: "Shipping",
	4: "Shipping method",
	5: "Payment",
	6: "Payment method",
};

export async function readCheckoutReport(input: {
	from: Date;
	to: Date;
	bucket: CheckoutBucket;
}): Promise<CheckoutReport> {
	await ensureAnalyticsSchema();

	const from = input.from.toISOString();
	const to = input.to.toISOString();
	const abandonmentCutoff = new Date(Math.min(Date.now() - 60 * 60 * 1_000, input.to.getTime())).toISOString();
	const sessionExpr = "COALESCE(session_id, event_id)";
	const jsonField = (path: string) =>
		`CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '${path}') ELSE NULL END`;
	const stageExpr =
		`COALESCE(NULLIF(checkout_stage, ''), ${jsonField("$.step")}, ${jsonField("$.stage")})`;
	const methodExpr = `COALESCE(NULLIF(method, ''), ${jsonField("$.method")})`;
	const providerExpr = `COALESCE(NULLIF(provider, ''), ${jsonField("$.provider")})`;
	const codeExpr = `COALESCE(NULLIF(error_code, ''), ${jsonField("$.code")})`;
	const reasonExpr = `COALESCE(NULLIF(failure_reason, ''), ${jsonField("$.reason")})`;
	const bucketExpr =
		input.bucket === "hour"
			? "substr(occurred_at, 1, 13) || ':00'"
			: "substr(occurred_at, 1, 10)";

	const [
		summaryResult,
		funnelResult,
		trendResult,
		abandonmentResult,
		failuresResult,
		paymentMethodsResult,
		shippingMethodsResult,
	] = await libsqlPipeline([
		{
			sql: `SELECT
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_started' THEN ${sessionExpr} END) AS started,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed' THEN ${sessionExpr} END) AS purchase_sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS orders,
				SUM(CASE WHEN event_name = 'payment_failed' THEN 1 ELSE 0 END) AS payment_failures,
				SUM(CASE WHEN event_name = 'checkout_failed' THEN 1 ELSE 0 END) AS checkout_failures
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT stage_key, COUNT(DISTINCT session_key) AS count
				FROM (
					SELECT ${sessionExpr} AS session_key,
						CASE
							WHEN event_name = 'checkout_started' THEN 'checkout_started'
							WHEN event_name = 'checkout_step_viewed' AND ${stageExpr} = 'contact' THEN 'contact'
							WHEN event_name = 'checkout_step_viewed' AND ${stageExpr} = 'shipping' THEN 'shipping'
							WHEN event_name = 'shipping_method_selected' THEN 'shipping_method_selected'
							WHEN event_name = 'checkout_step_viewed' AND ${stageExpr} = 'payment' THEN 'payment'
							WHEN event_name = 'payment_method_selected' THEN 'payment_method_selected'
							WHEN event_name = 'checkout_completed' THEN 'checkout_completed'
							ELSE NULL
						END AS stage_key
					FROM analytics_events
					WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				)
				WHERE stage_key IS NOT NULL
				GROUP BY stage_key`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT ${bucketExpr} AS bucket,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_started' THEN ${sessionExpr} END) AS started,
				COUNT(DISTINCT CASE
					WHEN event_name = 'checkout_step_viewed' AND ${stageExpr} = 'payment' THEN ${sessionExpr}
					WHEN event_name = 'payment_method_selected' THEN ${sessionExpr}
					ELSE NULL END) AS payment,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed' THEN ${sessionExpr} END) AS purchases,
				SUM(CASE WHEN event_name = 'payment_failed' THEN 1 ELSE 0 END) AS payment_failures
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ? AND COALESCE(device_type, '') != 'bot'
				GROUP BY ${bucketExpr}
				ORDER BY bucket ASC`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `WITH checkout_sessions AS (
				SELECT session_id,
					MAX(occurred_at) AS last_activity,
					MAX(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS completed,
					MAX(CASE
						WHEN event_name = 'checkout_completed' THEN 7
						WHEN event_name = 'payment_method_selected' THEN 6
						WHEN event_name = 'checkout_step_viewed' AND ${stageExpr} = 'payment' THEN 5
						WHEN event_name = 'shipping_method_selected' THEN 4
						WHEN event_name = 'checkout_step_viewed' AND ${stageExpr} = 'shipping' THEN 3
						WHEN event_name = 'checkout_step_viewed' AND ${stageExpr} = 'contact' THEN 2
						WHEN event_name = 'checkout_started' THEN 1
						ELSE 0 END) AS last_stage,
					MAX(CASE WHEN event_name = 'checkout_started' THEN 1 ELSE 0 END) AS started
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND COALESCE(device_type, '') != 'bot'
					AND session_id IS NOT NULL
					AND event_name IN (
						'checkout_started','checkout_step_viewed','shipping_method_selected',
						'payment_method_selected','payment_failed','checkout_failed','checkout_completed'
					)
				GROUP BY session_id
			)
			SELECT last_stage, COUNT(*) AS count
			FROM checkout_sessions
			WHERE started = 1 AND completed = 0 AND last_activity < ? AND last_stage BETWEEN 1 AND 6
			GROUP BY last_stage
			ORDER BY last_stage ASC`,
			args: [from, to, abandonmentCutoff],
			wantRows: true,
		},
		{
			sql: `SELECT event_name AS kind,
				COALESCE(NULLIF(${stageExpr}, ''), CASE WHEN event_name = 'payment_failed' THEN 'payment' ELSE 'unknown' END) AS stage,
				COALESCE(NULLIF(${providerExpr}, ''), 'unknown') AS provider,
				COALESCE(NULLIF(${codeExpr}, ''), 'unknown') AS code,
				COALESCE(NULLIF(${reasonExpr}, ''), 'Unknown failure') AS reason,
				COUNT(DISTINCT ${sessionExpr}) AS sessions,
				COUNT(*) AS occurrences
				FROM analytics_events
				WHERE occurred_at >= ? AND occurred_at < ?
					AND COALESCE(device_type, '') != 'bot'
					AND event_name IN ('payment_failed', 'checkout_failed')
				GROUP BY event_name,
					COALESCE(NULLIF(${stageExpr}, ''), CASE WHEN event_name = 'payment_failed' THEN 'payment' ELSE 'unknown' END),
					COALESCE(NULLIF(${providerExpr}, ''), 'unknown'),
					COALESCE(NULLIF(${codeExpr}, ''), 'unknown'),
					COALESCE(NULLIF(${reasonExpr}, ''), 'Unknown failure')
				ORDER BY occurrences DESC, sessions DESC
				LIMIT 30`,
			args: [from, to],
			wantRows: true,
		},
		methodPerformanceQuery("payment_method_selected", methodExpr, from, to),
		methodPerformanceQuery("shipping_method_selected", methodExpr, from, to),
	]);

	const summaryRow = hranaRowsToObjects(summaryResult)[0] ?? {};
	const funnelCounts = new Map(
		hranaRowsToObjects(funnelResult).map((row) => [
			String(row.stage_key ?? ""),
			Number(row.count ?? 0),
		]),
	);

	return {
		summary: {
			started: Number(summaryRow.started ?? 0),
			purchaseSessions: Number(summaryRow.purchase_sessions ?? 0),
			orders: Number(summaryRow.orders ?? 0),
			paymentFailures: Number(summaryRow.payment_failures ?? 0),
			checkoutFailures: Number(summaryRow.checkout_failures ?? 0),
		},
		funnel: FUNNEL_STAGES.map(([key, label]) => ({
			key,
			label,
			count: funnelCounts.get(key) ?? 0,
		})),
		trend: fillCheckoutTrendGaps(
			hranaRowsToObjects(trendResult).map((row) => ({
				bucket: String(row.bucket ?? ""),
				started: Number(row.started ?? 0),
				payment: Number(row.payment ?? 0),
				purchases: Number(row.purchases ?? 0),
				paymentFailures: Number(row.payment_failures ?? 0),
			})),
			input.from,
			input.to,
			input.bucket,
		),
		abandonment: hranaRowsToObjects(abandonmentResult).map((row) => {
			const stage = Number(row.last_stage ?? 0);
			return {
				stage: ABANDONMENT_LABELS[stage] ?? "Unknown",
				count: Number(row.count ?? 0),
			};
		}),
		failures: hranaRowsToObjects(failuresResult).map((row) => ({
			kind: String(row.kind ?? ""),
			stage: String(row.stage ?? "unknown"),
			provider: String(row.provider ?? "unknown"),
			code: String(row.code ?? "unknown"),
			reason: String(row.reason ?? "Unknown failure"),
			sessions: Number(row.sessions ?? 0),
			occurrences: Number(row.occurrences ?? 0),
		})),
		paymentMethods: hranaRowsToObjects(paymentMethodsResult).map((row) => ({
			method: String(row.method ?? "unknown"),
			selectedSessions: Number(row.selected_sessions ?? 0),
			purchaseSessions: Number(row.purchase_sessions ?? 0),
		})),
		shippingMethods: hranaRowsToObjects(shippingMethodsResult).map((row) => ({
			method: String(row.method ?? "unknown"),
			selectedSessions: Number(row.selected_sessions ?? 0),
			purchaseSessions: Number(row.purchase_sessions ?? 0),
		})),
	};
}

function methodPerformanceQuery(
	eventName: "payment_method_selected" | "shipping_method_selected",
	methodExpr: string,
	from: string,
	to: string,
) {
	return {
		sql: `WITH ranked AS (
			SELECT session_id,
				${methodExpr} AS method,
				ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY occurred_at DESC) AS row_number
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at < ?
				AND COALESCE(device_type, '') != 'bot'
				AND event_name = ?
				AND session_id IS NOT NULL
		),
		selected AS (
			SELECT session_id, COALESCE(NULLIF(method, ''), 'unknown') AS method
			FROM ranked WHERE row_number = 1
		),
		completed AS (
			SELECT DISTINCT session_id
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at < ?
				AND COALESCE(device_type, '') != 'bot'
				AND event_name = 'checkout_completed'
				AND session_id IS NOT NULL
		)
		SELECT selected.method,
			COUNT(*) AS selected_sessions,
			SUM(CASE WHEN completed.session_id IS NOT NULL THEN 1 ELSE 0 END) AS purchase_sessions
		FROM selected
		LEFT JOIN completed ON completed.session_id = selected.session_id
		GROUP BY selected.method
		ORDER BY selected_sessions DESC
		LIMIT 20`,
		args: [from, to, eventName, from, to],
		wantRows: true,
	};
}

function fillCheckoutTrendGaps(
	rows: CheckoutReport["trend"],
	from: Date,
	to: Date,
	bucket: CheckoutBucket,
): CheckoutReport["trend"] {
	if (to <= from) return [];
	const byBucket = new Map(rows.map((row) => [row.bucket, row]));
	const cursor = floorUtc(from, bucket);
	const last = floorUtc(new Date(to.getTime() - 1), bucket);
	const result: CheckoutReport["trend"] = [];

	while (cursor <= last) {
		const key = formatBucketKey(cursor, bucket);
		result.push(
			byBucket.get(key) ?? {
				bucket: key,
				started: 0,
				payment: 0,
				purchases: 0,
				paymentFailures: 0,
			},
		);
		if (bucket === "hour") cursor.setUTCHours(cursor.getUTCHours() + 1);
		else cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return result;
}

function floorUtc(date: Date, bucket: CheckoutBucket): Date {
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

function formatBucketKey(date: Date, bucket: CheckoutBucket): string {
	const iso = date.toISOString();
	return bucket === "hour" ? `${iso.slice(0, 13)}:00` : iso.slice(0, 10);
}
