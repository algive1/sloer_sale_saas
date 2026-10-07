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
	revenue: number;
	funnel: Array<{ name: string; count: number }>;
	sources: Array<{ source: string; count: number; revenue: number }>;
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
	const sessionId = readCookie(headers, ANALYTICS_SESSION_COOKIE);
	const itemIds = event.items?.map((item) => item.variantId || item.itemId) ?? [];
	const transactionId = "transactionId" in event ? event.transactionId ?? null : null;
	const value = "value" in event && typeof event.value === "number" ? event.value : null;
	const currency = "currency" in event && typeof event.currency === "string" ? event.currency : null;
	const channel = "channel" in event ? event.channel : "";
	const eventId = event.eventId || randomId();

	await libsqlPipeline([
		{
			sql: `INSERT OR IGNORE INTO analytics_events
				(id, occurred_at, event_name, channel, session_id, event_id, transaction_id, value, currency,
				 source, medium, campaign, landing_path, item_ids_json, payload_json)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
				landing?.source ?? null,
				landing?.medium ?? null,
				landing?.campaign ?? null,
				landing?.landingPath ?? null,
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

	const [totals, funnel, sources, recent] = await libsqlPipeline([
		{
			sql: `SELECT COUNT(*) AS total_events,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,
				COALESCE(SUM(CASE WHEN event_name = 'checkout_completed' THEN value ELSE 0 END), 0) AS revenue
				FROM analytics_events WHERE occurred_at >= ?`,
			args: [since],
			wantRows: true,
		},
		{
			sql: `SELECT event_name AS name, COUNT(*) AS count
				FROM analytics_events
				WHERE occurred_at >= ? AND event_name IN
				('product_viewed','wishlist_added','product_added_to_cart','cart_viewed','checkout_started','payment_method_selected','checkout_completed')
				GROUP BY event_name`,
			args: [since],
			wantRows: true,
		},
		{
			sql: `SELECT COALESCE(NULLIF(source, ''), 'direct') AS source, COUNT(*) AS count,
				COALESCE(SUM(CASE WHEN event_name = 'checkout_completed' THEN value ELSE 0 END), 0) AS revenue
				FROM analytics_events WHERE occurred_at >= ?
				GROUP BY COALESCE(NULLIF(source, ''), 'direct')
				ORDER BY revenue DESC, count DESC LIMIT 12`,
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
	const funnelRows = hranaRowsToObjects(funnel);
	const sourceRows = hranaRowsToObjects(sources);
	const recentRows = hranaRowsToObjects(recent);
	return {
		totalEvents: Number(totalRow.total_events ?? 0),
		sessions: Number(totalRow.sessions ?? 0),
		revenue: Number(totalRow.revenue ?? 0),
		funnel: funnelRows.map((row) => ({ name: String(row.name ?? ""), count: Number(row.count ?? 0) })),
		sources: sourceRows.map((row) => ({
			source: String(row.source ?? "direct"),
			count: Number(row.count ?? 0),
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
		]);
	})();
	await schemaPromise;
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
