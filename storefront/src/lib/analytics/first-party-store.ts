import "server-only";

import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import {
	ANALYTICS_LANDING_COOKIE,
	ANALYTICS_SESSION_COOKIE,
	parseLandingCookie,
} from "@/lib/analytics/cookies";
import {
	analyticsDatabaseConfigured,
	hranaRowsToObjects,
	libsqlPipeline,
} from "@/lib/analytics/libsql-http";

type HeaderReader = { get(name: string): string | null };

let schemaPromise: Promise<void> | null = null;

export type AnalyticsSummary = {
	totalEvents: number;
	sessions: number;
	purchases: number;
	revenueByCurrency: Array<{ currency: string; value: number }>;
	funnel: Array<{ name: string; count: number }>;
	sources: Array<{ source: string; currency: string; sessions: number; purchases: number; revenue: number }>;
	recent: Array<{
		occurredAt: string;
		name: string;
		channel: string;
		source: string;
		value: number;
		currency: string;
	}>;
};

export async function storeFirstPartyCommerceEvent(
	event: PaperCommerceEvent,
	headers: HeaderReader,
): Promise<void> {
	if (!analyticsDatabaseConfigured()) return;
	await ensureSchema();

	const landing = parseLandingCookie(readCookie(headers, ANALYTICS_LANDING_COOKIE));
	let sessionId = readCookie(headers, ANALYTICS_SESSION_COOKIE);
	let attribution = landing
		? {
				source: landing.source ?? null,
				medium: landing.medium ?? null,
				campaign: landing.campaign ?? null,
				landingPath: landing.landingPath ?? null,
				clickIds: {
					gclid: landing.gclid,
					gbraid: landing.gbraid,
					wbraid: landing.wbraid,
					fbclid: landing.fbclid,
					ttclid: landing.ttclid,
					msclkid: landing.msclkid,
				},
			}
		: null;
	const itemIds = event.items?.map((item) => item.variantId || item.itemId) ?? [];
	const transactionId = "transactionId" in event ? event.transactionId ?? null : null;
	const value = "value" in event && typeof event.value === "number" ? event.value : null;
	const currency = "currency" in event && typeof event.currency === "string" ? event.currency : null;
	const channel = "channel" in event ? event.channel : "";
	const eventId = event.eventId || randomId();

	if (event.name === "refund_completed" && event.transactionId && !attribution) {
		const [purchaseResult] = await libsqlPipeline([{
			sql: `SELECT session_id, source, medium, campaign, landing_path, click_ids_json
				FROM analytics_events
				WHERE event_name = 'checkout_completed' AND transaction_id = ?
				ORDER BY occurred_at ASC LIMIT 1`,
			args: [event.transactionId],
			wantRows: true,
		}]);
		const purchase = hranaRowsToObjects(purchaseResult)[0];
		if (purchase) {
			sessionId = typeof purchase.session_id === "string" ? purchase.session_id : sessionId;
			attribution = {
				source: typeof purchase.source === "string" ? purchase.source : null,
				medium: typeof purchase.medium === "string" ? purchase.medium : null,
				campaign: typeof purchase.campaign === "string" ? purchase.campaign : null,
				landingPath: typeof purchase.landing_path === "string" ? purchase.landing_path : null,
				clickIds: parseJsonRecord(purchase.click_ids_json),
			};
		}
	}

	await libsqlPipeline([
		{
			sql: `INSERT OR IGNORE INTO analytics_events
				(id, occurred_at, event_name, channel, session_id, event_id, transaction_id, value, currency,
				 source, medium, campaign, landing_path, click_ids_json, item_ids_json, payload_json)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				randomId(),
				new Date().toISOString(),
				event.name,
				channel,
				sessionId,
				eventId,
				transactionId,
				value,
				currency,
				attribution?.source ?? null,
				attribution?.medium ?? null,
				attribution?.campaign ?? null,
				attribution?.landingPath ?? null,
				JSON.stringify(attribution?.clickIds ?? {}),
				JSON.stringify(itemIds),
				safePayload(event),
			],
		},
	]);
}

export async function readAnalyticsSummary(days = 30): Promise<AnalyticsSummary | null> {
	if (!analyticsDatabaseConfigured()) return null;
	await ensureSchema();
	const safeDays = Math.max(1, Math.min(days, 365));
	const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();

	const [totals, revenue, funnel, sources, recent] = await libsqlPipeline([
		{
			sql: `SELECT COUNT(*) AS total_events,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS purchases
				FROM analytics_events WHERE occurred_at >= ?`,
			args: [since],
			wantRows: true,
		},
		{
			sql: `SELECT COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,
				COALESCE(SUM(CASE
					WHEN event_name = 'checkout_completed' THEN value
					WHEN event_name = 'refund_completed' THEN -value
					ELSE 0 END), 0) AS value
				FROM analytics_events
				WHERE occurred_at >= ? AND event_name IN ('checkout_completed', 'refund_completed')
				GROUP BY COALESCE(NULLIF(currency, ''), 'UNKNOWN')
				ORDER BY value DESC`,
			args: [since],
			wantRows: true,
		},
		{
			sql: `SELECT event_name AS name,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS count
				FROM analytics_events
				WHERE occurred_at >= ? AND event_name IN
				('product_viewed','wishlist_added','product_added_to_cart','cart_viewed','checkout_started','payment_method_selected','checkout_completed')
				GROUP BY event_name`,
			args: [since],
			wantRows: true,
		},
		{
			sql: `SELECT COALESCE(NULLIF(source, ''), 'direct') AS source,
				COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS purchases,
				COALESCE(SUM(CASE
					WHEN event_name = 'checkout_completed' THEN value
					WHEN event_name = 'refund_completed' THEN -value
					ELSE 0 END), 0) AS revenue
				FROM analytics_events WHERE occurred_at >= ?
				GROUP BY COALESCE(NULLIF(source, ''), 'direct'), COALESCE(NULLIF(currency, ''), 'UNKNOWN')
				ORDER BY revenue DESC, sessions DESC LIMIT 20`,
			args: [since],
			wantRows: true,
		},
		{
			sql: `SELECT occurred_at, event_name, channel, COALESCE(source, 'direct') AS source,
				COALESCE(value, 0) AS value, COALESCE(currency, '') AS currency
				FROM analytics_events WHERE occurred_at >= ?
				ORDER BY occurred_at DESC LIMIT 50`,
			args: [since],
			wantRows: true,
		},
	]);

	const totalRow = hranaRowsToObjects(totals)[0] ?? {};
	const revenueRows = hranaRowsToObjects(revenue);
	const funnelRows = hranaRowsToObjects(funnel);
	const sourceRows = hranaRowsToObjects(sources);
	const recentRows = hranaRowsToObjects(recent);
	return {
		totalEvents: Number(totalRow.total_events ?? 0),
		sessions: Number(totalRow.sessions ?? 0),
		purchases: Number(totalRow.purchases ?? 0),
		revenueByCurrency: revenueRows.map((row) => ({
			currency: String(row.currency ?? "UNKNOWN"),
			value: Number(row.value ?? 0),
		})),
		funnel: funnelRows.map((row) => ({ name: String(row.name ?? ""), count: Number(row.count ?? 0) })),
		sources: sourceRows.map((row) => ({
			source: String(row.source ?? "direct"),
			currency: String(row.currency ?? "UNKNOWN"),
			sessions: Number(row.sessions ?? 0),
			purchases: Number(row.purchases ?? 0),
			revenue: Number(row.revenue ?? 0),
		})),
		recent: recentRows.map((row) => ({
			occurredAt: String(row.occurred_at ?? ""),
			name: String(row.event_name ?? ""),
			channel: String(row.channel ?? ""),
			source: String(row.source ?? "direct"),
			value: Number(row.value ?? 0),
			currency: String(row.currency ?? ""),
		})),
	};
}

async function ensureSchema(): Promise<void> {
	schemaPromise ??= (async () => {
		await libsqlPipeline([
			{
				sql: `CREATE TABLE IF NOT EXISTS analytics_events (
					id TEXT PRIMARY KEY,
					occurred_at TEXT NOT NULL,
					event_name TEXT NOT NULL,
					channel TEXT,
					session_id TEXT,
					event_id TEXT,
					transaction_id TEXT,
					value REAL,
					currency TEXT,
					source TEXT,
					medium TEXT,
					campaign TEXT,
					landing_path TEXT,
					click_ids_json TEXT NOT NULL DEFAULT '{}',
					item_ids_json TEXT NOT NULL DEFAULT '[]',
					payload_json TEXT NOT NULL
				)`,
			},
			{
				sql: "CREATE UNIQUE INDEX IF NOT EXISTS analytics_event_id_idx ON analytics_events(event_name, event_id)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS analytics_occurred_idx ON analytics_events(occurred_at)",
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS analytics_refund_totals (
					order_id TEXT PRIMARY KEY,
					total_refunded REAL NOT NULL,
					currency TEXT NOT NULL,
					updated_at TEXT NOT NULL
				)`,
			},
		]);
	})();
	await schemaPromise;
}

export async function recordRefundTotal(
	orderId: string,
	totalRefunded: number,
	currency: string,
): Promise<number> {
	if (!analyticsDatabaseConfigured() || !orderId || totalRefunded <= 0 || !currency) return 0;
	await ensureSchema();
	const [previousResult] = await libsqlPipeline([{
		sql: "SELECT total_refunded, currency FROM analytics_refund_totals WHERE order_id = ? LIMIT 1",
		args: [orderId],
		wantRows: true,
	}]);
	const previous = hranaRowsToObjects(previousResult)[0];
	const previousTotal =
		previous && String(previous.currency ?? "") === currency ? Number(previous.total_refunded ?? 0) : 0;
	const delta = Math.max(0, totalRefunded - previousTotal);
	if (delta <= 0) return 0;
	await libsqlPipeline([{
		sql: `INSERT INTO analytics_refund_totals(order_id, total_refunded, currency, updated_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(order_id) DO UPDATE SET
				total_refunded = CASE
					WHEN excluded.total_refunded > analytics_refund_totals.total_refunded
					THEN excluded.total_refunded ELSE analytics_refund_totals.total_refunded END,
				currency = excluded.currency,
				updated_at = excluded.updated_at`,
		args: [orderId, totalRefunded, currency, new Date().toISOString()],
	}]);
	return delta;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "string" || !value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function readCookie(headers: HeaderReader, name: string): string | null {
	const raw = headers.get("cookie");
	if (!raw) return null;
	for (const part of raw.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key !== name) continue;
		try {
			return decodeURIComponent(rest.join("="));
		} catch {
			return rest.join("=");
		}
	}
	return null;
}

function safePayload(event: PaperCommerceEvent): string {
	const raw = JSON.stringify(event);
	return raw.length <= 16_000 ? raw : raw.slice(0, 16_000);
}

function randomId(): string {
	return typeof crypto !== "undefined" && crypto.randomUUID
		? crypto.randomUUID()
		: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
