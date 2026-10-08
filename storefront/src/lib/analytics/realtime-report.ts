import "server-only";

import { ensureAnalyticsSchema } from "@/lib/analytics/first-party-store";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/analytics/libsql-http";

export type RealtimeAnalytics = {
	generatedAt: string;
	windowMinutes: number;
	summary: {
		activeSessions: number;
		events: number;
		addToCartSessions: number;
		checkoutSessions: number;
		purchaseSessions: number;
		orders: number;
		paymentFailures: number;
	};
	salesByCurrency: Array<{ currency: string; value: number }>;
	sources: Array<{ source: string; trafficType: string; sessions: number }>;
	countries: Array<{ countryCode: string; sessions: number }>;
	topProducts: Array<{
		itemKey: string;
		itemName: string;
		sku: string;
		viewSessions: number;
		addToCartSessions: number;
		purchaseSessions: number;
	}>;
	recentOrders: Array<{
		occurredAt: string;
		transactionId: string;
		countryCode: string;
		source: string;
		value: number;
		currency: string;
	}>;
	recentEvents: Array<{
		occurredAt: string;
		name: string;
		countryCode: string;
		source: string;
		channel: string;
		value: number;
		currency: string;
		itemName: string;
	}>;
	trend: Array<{
		bucket: string;
		activeSessions: number;
		events: number;
		purchases: number;
	}>;
};

export async function readRealtimeAnalytics(now = new Date()): Promise<RealtimeAnalytics> {
	await ensureAnalyticsSchema();

	const windowMinutes = 5;
	const windowFrom = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
	const trendFromDate = floorUtcMinute(new Date(now.getTime() - 29 * 60_000));
	const trendFrom = trendFromDate.toISOString();
	const to = now.toISOString();
	const sessionExpr = "COALESCE(session_id, event_id)";
	const sourceExpr = "COALESCE(NULLIF(source_group, ''), NULLIF(source, ''), 'direct')";
	const sourceAeExpr = "COALESCE(NULLIF(ae.source_group, ''), NULLIF(ae.source, ''), 'direct')";
	const sessionAeExpr = "COALESCE(ae.session_id, ae.event_id)";
	const trafficExpr = "COALESCE(NULLIF(traffic_type, ''), 'direct')";

	const [
		summaryResult,
		salesResult,
		sourceResult,
		countryResult,
		productResult,
		ordersResult,
		eventsResult,
		trendResult,
	] = await libsqlPipeline([
		{
			sql: `SELECT
				COUNT(DISTINCT ${sessionExpr}) AS active_sessions,
				COUNT(*) AS events,
				COUNT(DISTINCT CASE WHEN event_name = 'product_added_to_cart' THEN ${sessionExpr} END) AS add_to_cart_sessions,
				COUNT(DISTINCT CASE WHEN event_name IN (
					'checkout_started','checkout_step_viewed','shipping_method_selected','payment_method_selected'
				) THEN ${sessionExpr} END) AS checkout_sessions,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed' THEN ${sessionExpr} END) AS purchase_sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS orders,
				SUM(CASE WHEN event_name = 'payment_failed' THEN 1 ELSE 0 END) AS payment_failures
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at <= ?
				AND COALESCE(device_type, '') != 'bot'`,
			args: [windowFrom, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,
				COALESCE(SUM(value), 0) AS value
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at <= ?
				AND COALESCE(device_type, '') != 'bot'
				AND event_name = 'checkout_completed'
			GROUP BY COALESCE(NULLIF(currency, ''), 'UNKNOWN')
			ORDER BY value DESC`,
			args: [windowFrom, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				${sourceExpr} AS source,
				${trafficExpr} AS traffic_type,
				COUNT(DISTINCT ${sessionExpr}) AS sessions
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at <= ?
				AND COALESCE(device_type, '') != 'bot'
			GROUP BY ${sourceExpr}, ${trafficExpr}
			ORDER BY sessions DESC
			LIMIT 10`,
			args: [windowFrom, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				COALESCE(NULLIF(country_code, ''), 'UNKNOWN') AS country_code,
				COUNT(DISTINCT ${sessionExpr}) AS sessions
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at <= ?
				AND COALESCE(device_type, '') != 'bot'
			GROUP BY COALESCE(NULLIF(country_code, ''), 'UNKNOWN')
			ORDER BY sessions DESC
			LIMIT 10`,
			args: [windowFrom, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				COALESCE(NULLIF(ai.variant_id, ''), ai.item_id) AS item_key,
				COALESCE(MAX(NULLIF(ai.item_name, '')), COALESCE(NULLIF(ai.variant_id, ''), ai.item_id)) AS item_name,
				COALESCE(MAX(NULLIF(ai.sku, '')), '') AS sku,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_viewed' THEN ${sessionAeExpr} END) AS view_sessions,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_added_to_cart' THEN ${sessionAeExpr} END) AS add_to_cart_sessions,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'checkout_completed' THEN ${sessionAeExpr} END) AS purchase_sessions
			FROM analytics_event_items ai
			JOIN analytics_events ae
				ON ae.event_name = ai.event_name AND ae.event_id = ai.event_id
			WHERE ae.occurred_at >= ? AND ae.occurred_at <= ?
				AND COALESCE(ae.device_type, '') != 'bot'
			GROUP BY COALESCE(NULLIF(ai.variant_id, ''), ai.item_id)
			ORDER BY view_sessions DESC, add_to_cart_sessions DESC, purchase_sessions DESC
			LIMIT 10`,
			args: [windowFrom, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				occurred_at,
				COALESCE(transaction_id, '') AS transaction_id,
				COALESCE(NULLIF(country_code, ''), 'UNKNOWN') AS country_code,
				${sourceExpr} AS source,
				COALESCE(value, 0) AS value,
				COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at <= ?
				AND COALESCE(device_type, '') != 'bot'
				AND event_name = 'checkout_completed'
			ORDER BY occurred_at DESC
			LIMIT 20`,
			args: [new Date(now.getTime() - 60 * 60_000).toISOString(), to],
			wantRows: true,
		},
		{
			sql: `SELECT
				ae.occurred_at,
				ae.event_name,
				COALESCE(NULLIF(ae.country_code, ''), 'UNKNOWN') AS country_code,
				${sourceAeExpr} AS source,
				COALESCE(ae.channel, '') AS channel,
				COALESCE(ae.value, 0) AS value,
				COALESCE(ae.currency, '') AS currency,
				COALESCE((
					SELECT NULLIF(ai.item_name, '')
					FROM analytics_event_items ai
					WHERE ai.event_name = ae.event_name AND ai.event_id = ae.event_id
					ORDER BY ai.item_index ASC
					LIMIT 1
				), '') AS item_name
			FROM analytics_events ae
			WHERE ae.occurred_at >= ? AND ae.occurred_at <= ?
				AND COALESCE(ae.device_type, '') != 'bot'
			ORDER BY ae.occurred_at DESC
			LIMIT 50`,
			args: [windowFrom, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				substr(occurred_at, 1, 16) AS bucket,
				COUNT(DISTINCT ${sessionExpr}) AS active_sessions,
				COUNT(*) AS events,
				COUNT(DISTINCT CASE WHEN event_name = 'checkout_completed' THEN ${sessionExpr} END) AS purchases
			FROM analytics_events
			WHERE occurred_at >= ? AND occurred_at <= ?
				AND COALESCE(device_type, '') != 'bot'
			GROUP BY substr(occurred_at, 1, 16)
			ORDER BY bucket ASC`,
			args: [trendFrom, to],
			wantRows: true,
		},
	]);

	const summary = hranaRowsToObjects(summaryResult)[0] ?? {};
	const rawTrend = hranaRowsToObjects(trendResult).map((row) => ({
		bucket: String(row.bucket ?? ""),
		activeSessions: Number(row.active_sessions ?? 0),
		events: Number(row.events ?? 0),
		purchases: Number(row.purchases ?? 0),
	}));

	return {
		generatedAt: now.toISOString(),
		windowMinutes,
		summary: {
			activeSessions: Number(summary.active_sessions ?? 0),
			events: Number(summary.events ?? 0),
			addToCartSessions: Number(summary.add_to_cart_sessions ?? 0),
			checkoutSessions: Number(summary.checkout_sessions ?? 0),
			purchaseSessions: Number(summary.purchase_sessions ?? 0),
			orders: Number(summary.orders ?? 0),
			paymentFailures: Number(summary.payment_failures ?? 0),
		},
		salesByCurrency: hranaRowsToObjects(salesResult).map((row) => ({
			currency: String(row.currency ?? "UNKNOWN"),
			value: Number(row.value ?? 0),
		})),
		sources: hranaRowsToObjects(sourceResult).map((row) => ({
			source: String(row.source ?? "direct"),
			trafficType: String(row.traffic_type ?? "direct"),
			sessions: Number(row.sessions ?? 0),
		})),
		countries: hranaRowsToObjects(countryResult).map((row) => ({
			countryCode: String(row.country_code ?? "UNKNOWN"),
			sessions: Number(row.sessions ?? 0),
		})),
		topProducts: hranaRowsToObjects(productResult).map((row) => ({
			itemKey: String(row.item_key ?? ""),
			itemName: String(row.item_name ?? ""),
			sku: String(row.sku ?? ""),
			viewSessions: Number(row.view_sessions ?? 0),
			addToCartSessions: Number(row.add_to_cart_sessions ?? 0),
			purchaseSessions: Number(row.purchase_sessions ?? 0),
		})),
		recentOrders: hranaRowsToObjects(ordersResult).map((row) => ({
			occurredAt: String(row.occurred_at ?? ""),
			transactionId: String(row.transaction_id ?? ""),
			countryCode: String(row.country_code ?? "UNKNOWN"),
			source: String(row.source ?? "direct"),
			value: Number(row.value ?? 0),
			currency: String(row.currency ?? "UNKNOWN"),
		})),
		recentEvents: hranaRowsToObjects(eventsResult).map((row) => ({
			occurredAt: String(row.occurred_at ?? ""),
			name: String(row.event_name ?? ""),
			countryCode: String(row.country_code ?? "UNKNOWN"),
			source: String(row.source ?? "direct"),
			channel: String(row.channel ?? ""),
			value: Number(row.value ?? 0),
			currency: String(row.currency ?? ""),
			itemName: String(row.item_name ?? ""),
		})),
		trend: fillMinuteTrend(rawTrend, trendFromDate, floorUtcMinute(now)),
	};
}

function fillMinuteTrend(
	rows: RealtimeAnalytics["trend"],
	from: Date,
	to: Date,
): RealtimeAnalytics["trend"] {
	const byBucket = new Map(rows.map((row) => [row.bucket, row]));
	const cursor = new Date(from);
	const result: RealtimeAnalytics["trend"] = [];
	while (cursor <= to) {
		const key = cursor.toISOString().slice(0, 16);
		result.push(
			byBucket.get(key) ?? {
				bucket: key,
				activeSessions: 0,
				events: 0,
				purchases: 0,
			},
		);
		cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
	}
	return result;
}

function floorUtcMinute(date: Date): Date {
	return new Date(Date.UTC(
		date.getUTCFullYear(),
		date.getUTCMonth(),
		date.getUTCDate(),
		date.getUTCHours(),
		date.getUTCMinutes(),
	));
}
