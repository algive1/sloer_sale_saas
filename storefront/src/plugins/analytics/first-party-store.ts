import "server-only";

import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { checkoutAnalyticsDimensions } from "@/lib/analytics/checkout-dimensions";
import { analyticsChannelClause } from "./channel-scope";
import { analyticsEventItems } from "@/lib/analytics/event-items";
import { readAnalyticsRequestContext } from "@/lib/analytics/request-context";
import { normalizeTrafficAttribution, type TrafficType } from "@/lib/analytics/traffic-source";
import {
	ANALYTICS_LANDING_COOKIE,
	ANALYTICS_SESSION_COOKIE,
	parseLandingCookie,
} from "@/lib/analytics/cookies";
import {
	analyticsDatabaseConfigured,
	hranaRowsToObjects,
	libsqlPipeline,
} from "@/lib/storage/libsql-http";

type HeaderReader = { get(name: string): string | null };

type StoredAttribution = {
	source: string | null;
	medium: string | null;
	campaign: string | null;
	landingPath: string | null;
	trafficType: TrafficType;
	sourceGroup: string;
	referrerHost: string | null;
	clickIds: Record<string, unknown>;
};

let schemaPromise: Promise<void> | null = null;

export type AnalyticsSummary = {
	totalEvents: number;
	sessions: number;
	purchases: number;
	paymentFailures: number;
	abandonedCheckouts: number;
	revenueByCurrency: Array<{ currency: string; value: number }>;
	funnel: Array<{ name: string; count: number }>;
	sources: Array<{
		source: string;
		trafficType: string;
		sessions: number;
		purchases: number;
		revenueByCurrency: Array<{ currency: string; value: number }>;
	}>;
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
	const normalizedTraffic = normalizeTrafficAttribution(landing);
	let requestContext = readAnalyticsRequestContext(headers);
	let sessionId = readCookie(headers, ANALYTICS_SESSION_COOKIE);
	let attribution: StoredAttribution | null = landing
		? {
				source: landing.source ?? null,
				medium: landing.medium ?? null,
				campaign: landing.campaign ?? null,
				landingPath: landing.landingPath ?? null,
				trafficType: normalizedTraffic.trafficType,
				sourceGroup: normalizedTraffic.sourceGroup,
				referrerHost: normalizedTraffic.referrerHost,
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
	const normalizedItems = analyticsEventItems(event);
	const itemIds = normalizedItems.map((item) => item.variantId || item.itemId);
	const transactionId = "transactionId" in event ? event.transactionId ?? null : null;
	const value = "value" in event && typeof event.value === "number" ? event.value : null;
	const currency = "currency" in event && typeof event.currency === "string" ? event.currency : null;
	const channel = "channel" in event ? event.channel : "";
	const { checkoutStage, method, provider, errorCode, failureReason } =
		checkoutAnalyticsDimensions(event);
	const eventId = event.eventId || randomId();
	const occurredAt = new Date().toISOString();

	if (event.name === "refund_completed" && event.transactionId && !attribution) {
		const [purchaseResult] = await libsqlPipeline([{
			sql: `SELECT session_id, source, medium, campaign, landing_path, traffic_type, source_group, referrer_host,
				country_code, region_code, device_type, click_ids_json
				FROM analytics_events
				WHERE event_name = 'checkout_completed' AND transaction_id = ? AND channel = ?
				ORDER BY occurred_at ASC LIMIT 1`,
			args: [event.transactionId, channel],
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
				trafficType: isTrafficType(purchase.traffic_type) ? purchase.traffic_type : "direct",
				sourceGroup: typeof purchase.source_group === "string" ? purchase.source_group : "direct",
				referrerHost: typeof purchase.referrer_host === "string" ? purchase.referrer_host : null,
				clickIds: parseJsonRecord(purchase.click_ids_json),
			};
			requestContext = {
				countryCode: typeof purchase.country_code === "string" ? purchase.country_code : null,
				regionCode: typeof purchase.region_code === "string" ? purchase.region_code : null,
				deviceType: isDeviceType(purchase.device_type) ? purchase.device_type : "unknown",
			};
		}
	}

	const traffic = attribution ?? {
		source: null,
		medium: null,
		campaign: null,
		landingPath: null,
		trafficType: normalizedTraffic.trafficType,
		sourceGroup: normalizedTraffic.sourceGroup,
		referrerHost: normalizedTraffic.referrerHost,
		clickIds: {},
	};

	const statements = [
		{
			sql: `INSERT OR IGNORE INTO analytics_events
				(id, occurred_at, event_name, channel, session_id, event_id, transaction_id, value, currency,
				 source, medium, campaign, landing_path, traffic_type, source_group, referrer_host,
				 country_code, region_code, device_type, checkout_stage, method, provider, error_code, failure_reason,
				 click_ids_json, item_ids_json, payload_json)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				randomId(),
				occurredAt,
				event.name,
				channel,
				sessionId,
				eventId,
				transactionId,
				value,
				currency,
				traffic.source,
				traffic.medium,
				traffic.campaign,
				traffic.landingPath,
				traffic.trafficType,
				traffic.sourceGroup,
				traffic.referrerHost,
				requestContext.countryCode,
				requestContext.regionCode,
				requestContext.deviceType,
				checkoutStage,
				method,
				provider,
				errorCode,
				failureReason,
				JSON.stringify(traffic.clickIds),
				JSON.stringify(itemIds),
				safePayload(event),
			],
		},
	];

	for (const [itemIndex, item] of normalizedItems.entries()) {
		statements.push({
			sql: `INSERT OR IGNORE INTO analytics_event_items
				(event_name, event_id, item_index, item_id, product_id, variant_id, sku, item_name, category_id, category_name, image_url, price, quantity)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				event.name,
				eventId,
				itemIndex,
				item.itemId,
				item.productId,
				item.variantId,
				item.sku,
				item.itemName,
				item.categoryId,
				item.categoryName,
				item.imageUrl,
				item.price,
				item.quantity,
			],
		});
	}

	await libsqlPipeline(statements);
}

export async function readAnalyticsSummary(days = 30, channels: readonly string[] | null = null): Promise<AnalyticsSummary | null> {
	if (!analyticsDatabaseConfigured()) return null;
	await ensureSchema();
	const scoped = analyticsChannelClause(channels);
	const safeDays = Math.max(1, Math.min(days, 365));
	const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();
	const abandonmentCutoff = new Date(Date.now() - 60 * 60 * 1_000).toISOString();

	const [totals, revenue, funnel, sourceStats, sourceRevenue, abandoned, recent] = await libsqlPipeline([
		{
			sql: `SELECT COUNT(*) AS total_events,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS purchases,
				SUM(CASE WHEN event_name = 'payment_failed' THEN 1 ELSE 0 END) AS payment_failures
				FROM analytics_events WHERE occurred_at >= ?${scoped.sql}`,
			args: [since, ...scoped.args],
			wantRows: true,
		},
		{
			sql: `SELECT COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,
				COALESCE(SUM(CASE
					WHEN event_name = 'checkout_completed' THEN value
					WHEN event_name = 'refund_completed' THEN -value
					ELSE 0 END), 0) AS value
				FROM analytics_events
				WHERE occurred_at >= ?${scoped.sql} AND event_name IN ('checkout_completed', 'refund_completed')
				GROUP BY COALESCE(NULLIF(currency, ''), 'UNKNOWN')
				ORDER BY value DESC`,
			args: [since, ...scoped.args],
			wantRows: true,
		},
		{
			sql: `SELECT event_name AS name,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS count
				FROM analytics_events
				WHERE occurred_at >= ?${scoped.sql} AND event_name IN
				('page_viewed','product_viewed','wishlist_added','product_added_to_cart','cart_viewed','checkout_started','payment_method_selected','checkout_completed')
				GROUP BY event_name`,
			args: [since, ...scoped.args],
			wantRows: true,
		},
		{
			sql: `SELECT COALESCE(NULLIF(source_group, ''), NULLIF(source, ''), 'direct') AS source,
				COALESCE(NULLIF(traffic_type, ''), 'direct') AS traffic_type,
				COUNT(DISTINCT COALESCE(session_id, event_id)) AS sessions,
				SUM(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) AS purchases
				FROM analytics_events WHERE occurred_at >= ?${scoped.sql}
				GROUP BY COALESCE(NULLIF(source_group, ''), NULLIF(source, ''), 'direct'),
					COALESCE(NULLIF(traffic_type, ''), 'direct')
				ORDER BY sessions DESC LIMIT 20`,
			args: [since, ...scoped.args],
			wantRows: true,
		},
		{
			sql: `SELECT COALESCE(NULLIF(source_group, ''), NULLIF(source, ''), 'direct') AS source,
				COALESCE(NULLIF(currency, ''), 'UNKNOWN') AS currency,
				COALESCE(SUM(CASE
					WHEN event_name = 'checkout_completed' THEN value
					WHEN event_name = 'refund_completed' THEN -value
					ELSE 0 END), 0) AS revenue
				FROM analytics_events
				WHERE occurred_at >= ?${scoped.sql} AND event_name IN ('checkout_completed', 'refund_completed')
				GROUP BY COALESCE(NULLIF(source_group, ''), NULLIF(source, ''), 'direct'), COALESCE(NULLIF(currency, ''), 'UNKNOWN')`,
			args: [since, ...scoped.args],
			wantRows: true,
		},
		{
			sql: `SELECT COUNT(*) AS abandoned FROM (
				SELECT session_id FROM analytics_events
				WHERE occurred_at >= ?${scoped.sql} AND session_id IS NOT NULL
				GROUP BY session_id
				HAVING MAX(CASE WHEN event_name = 'checkout_started' THEN occurred_at ELSE NULL END) IS NOT NULL
					AND MAX(CASE WHEN event_name = 'checkout_completed' THEN 1 ELSE 0 END) = 0
					AND MAX(CASE WHEN event_name = 'checkout_started' THEN occurred_at ELSE '' END) < ?
			)`,
			args: [since, ...scoped.args, abandonmentCutoff],
			wantRows: true,
		},
		{
			sql: `SELECT occurred_at, event_name, channel, COALESCE(source, 'direct') AS source,
				COALESCE(value, 0) AS value, COALESCE(currency, '') AS currency
				FROM analytics_events WHERE occurred_at >= ?${scoped.sql}
				ORDER BY occurred_at DESC LIMIT 50`,
			args: [since, ...scoped.args],
			wantRows: true,
		},
	]);

	const totalRow = hranaRowsToObjects(totals)[0] ?? {};
	const revenueRows = hranaRowsToObjects(revenue);
	const funnelRows = hranaRowsToObjects(funnel);
	const sourceStatRows = hranaRowsToObjects(sourceStats);
	const sourceRevenueRows = hranaRowsToObjects(sourceRevenue);
	const abandonedRow = hranaRowsToObjects(abandoned)[0] ?? {};
	const recentRows = hranaRowsToObjects(recent);

	const revenueBySource = new Map<string, Array<{ currency: string; value: number }>>();
	for (const row of sourceRevenueRows) {
		const source = String(row.source ?? "direct");
		const list = revenueBySource.get(source) ?? [];
		list.push({ currency: String(row.currency ?? "UNKNOWN"), value: Number(row.revenue ?? 0) });
		revenueBySource.set(source, list);
	}

	return {
		totalEvents: Number(totalRow.total_events ?? 0),
		sessions: Number(totalRow.sessions ?? 0),
		purchases: Number(totalRow.purchases ?? 0),
		paymentFailures: Number(totalRow.payment_failures ?? 0),
		abandonedCheckouts: Number(abandonedRow.abandoned ?? 0),
		revenueByCurrency: revenueRows.map((row) => ({
			currency: String(row.currency ?? "UNKNOWN"),
			value: Number(row.value ?? 0),
		})),
		funnel: funnelRows.map((row) => ({ name: String(row.name ?? ""), count: Number(row.count ?? 0) })),
		sources: sourceStatRows.map((row) => {
			const source = String(row.source ?? "direct");
			return {
				source,
				trafficType: String(row.traffic_type ?? "direct"),
				sessions: Number(row.sessions ?? 0),
				purchases: Number(row.purchases ?? 0),
				revenueByCurrency: revenueBySource.get(source) ?? [],
			};
		}),
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
					traffic_type TEXT,
					source_group TEXT,
					referrer_host TEXT,
					country_code TEXT,
					region_code TEXT,
					device_type TEXT,
					checkout_stage TEXT,
					method TEXT,
					provider TEXT,
					error_code TEXT,
					failure_reason TEXT,
					click_ids_json TEXT NOT NULL DEFAULT '{}',
					item_ids_json TEXT NOT NULL DEFAULT '[]',
					payload_json TEXT NOT NULL
				)`,
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS analytics_refund_totals (
					order_id TEXT PRIMARY KEY,
					total_refunded REAL NOT NULL,
					currency TEXT NOT NULL,
					updated_at TEXT NOT NULL
				)`,
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS analytics_event_items (
					event_name TEXT NOT NULL,
					event_id TEXT NOT NULL,
					item_index INTEGER NOT NULL,
					item_id TEXT NOT NULL,
					product_id TEXT,
					variant_id TEXT,
					sku TEXT,
					item_name TEXT,
					category_id TEXT,
					category_name TEXT,
					image_url TEXT,
					price REAL,
					quantity INTEGER NOT NULL,
					PRIMARY KEY(event_name, event_id, item_index)
				)`,
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS analytics_schema_meta (
					key TEXT PRIMARY KEY,
					applied_at TEXT NOT NULL
				)`,
			},
		]);

		const [columnResult] = await libsqlPipeline([{ sql: "PRAGMA table_info(analytics_events)", wantRows: true }]);
		const columns = new Set(hranaRowsToObjects(columnResult).map((row) => String(row.name ?? "")));
		const additions = [
			["traffic_type", "TEXT"],
			["source_group", "TEXT"],
			["referrer_host", "TEXT"],
			["country_code", "TEXT"],
			["region_code", "TEXT"],
			["device_type", "TEXT"],
			["checkout_stage", "TEXT"],
			["method", "TEXT"],
			["provider", "TEXT"],
			["error_code", "TEXT"],
			["failure_reason", "TEXT"],
		] as const;
		const migrations = additions
			.filter(([name]) => !columns.has(name))
			.map(([name, type]) => ({ sql: `ALTER TABLE analytics_events ADD COLUMN ${name} ${type}` }));
		if (migrations.length > 0) await libsqlPipeline(migrations);

        const [itemColumnsResult] = await libsqlPipeline([
            { sql: "PRAGMA table_info(analytics_event_items)", wantRows: true },
        ]);
        const itemColumns = new Set(
            hranaRowsToObjects(itemColumnsResult).map((row) => String(row.name ?? "")),
        );
        const missingItemColumns = [
            ["product_id", "TEXT"],
            ["category_id", "TEXT"],
            ["category_name", "TEXT"],
            ["image_url", "TEXT"],
        ] as const;
        const itemMigrations = missingItemColumns
            .filter(([name]) => !itemColumns.has(name))
            .map(([name, type]) => ({ sql: "ALTER TABLE analytics_event_items ADD COLUMN " + name + " " + type }));
        if (itemMigrations.length > 0) await libsqlPipeline(itemMigrations);

		await libsqlPipeline([
			{
				sql: `UPDATE analytics_events
				SET traffic_type = CASE
					WHEN click_ids_json LIKE '%"gclid":%' OR click_ids_json LIKE '%"gbraid":%' OR click_ids_json LIKE '%"wbraid":%'
						OR click_ids_json LIKE '%"ttclid":%' OR click_ids_json LIKE '%"msclkid":%' THEN 'paid'
					WHEN lower(replace(COALESCE(medium, ''), '-', '_')) IN
						('cpc','ppc','paid','paid_search','paid_social','paidsocial','display','cpm','cpv','cpa','affiliate_paid') THEN 'paid'
					WHEN lower(replace(COALESCE(medium, ''), '-', '_')) IN
						('organic','organic_search','organic_social') THEN 'organic'
					WHEN COALESCE(source, '') = '' AND COALESCE(medium, '') = '' THEN 'direct'
					ELSE 'other'
				END
				WHERE traffic_type IS NULL OR traffic_type = ''`,
			},
			{
				sql: `UPDATE analytics_events
				SET source_group = CASE
					WHEN lower(COALESCE(source, '')) LIKE '%google%' OR click_ids_json LIKE '%"gclid":%'
						OR click_ids_json LIKE '%"gbraid":%' OR click_ids_json LIKE '%"wbraid":%' THEN 'google'
					WHEN lower(COALESCE(source, '')) IN ('facebook','fb','instagram','meta') THEN 'meta'
					WHEN lower(COALESCE(source, '')) LIKE '%tiktok%' OR click_ids_json LIKE '%"ttclid":%' THEN 'tiktok'
					WHEN lower(COALESCE(source, '')) IN ('bing','microsoft','msn') OR click_ids_json LIKE '%"msclkid":%' THEN 'microsoft'
					WHEN COALESCE(source, '') != '' THEN lower(source)
					WHEN traffic_type = 'direct' THEN 'direct'
					ELSE 'other'
				END
				WHERE source_group IS NULL OR source_group = ''`,
			},
		]);

		const [itemBackfillResult] = await libsqlPipeline([{
			sql: "SELECT key FROM analytics_schema_meta WHERE key = 'event_items_backfill_v1' LIMIT 1",
			wantRows: true,
		}]);
		if (hranaRowsToObjects(itemBackfillResult).length === 0) {
			await libsqlPipeline([
				{
					sql: `INSERT OR IGNORE INTO analytics_event_items
						(event_name, event_id, item_index, item_id, variant_id, sku, item_name, price, quantity)
					SELECT ae.event_name,
						ae.event_id,
						CAST(items.key AS INTEGER),
						COALESCE(NULLIF(json_extract(items.value, '$.itemId'), ''), NULLIF(json_extract(items.value, '$.variantId'), '')),
						NULLIF(json_extract(items.value, '$.variantId'), ''),
						NULLIF(json_extract(items.value, '$.sku'), ''),
						NULLIF(json_extract(items.value, '$.itemName'), ''),
						CAST(json_extract(items.value, '$.price') AS REAL),
						CASE
							WHEN CAST(COALESCE(json_extract(items.value, '$.quantity'), 1) AS INTEGER) > 0
							THEN CAST(COALESCE(json_extract(items.value, '$.quantity'), 1) AS INTEGER)
							ELSE 1
						END
					FROM analytics_events AS ae
					JOIN json_each(
						CASE WHEN json_valid(ae.payload_json) THEN ae.payload_json ELSE '{}' END,
						'$.items'
					) AS items
					WHERE ae.event_id IS NOT NULL
						AND COALESCE(NULLIF(json_extract(items.value, '$.itemId'), ''), NULLIF(json_extract(items.value, '$.variantId'), '')) IS NOT NULL`,
				},
				{
					sql: "INSERT OR IGNORE INTO analytics_schema_meta(key, applied_at) VALUES ('event_items_backfill_v1', ?)",
					args: [new Date().toISOString()],
				},
			]);
		}

		await libsqlPipeline([
			{
				sql: "CREATE UNIQUE INDEX IF NOT EXISTS analytics_event_id_idx ON analytics_events(event_name, event_id)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS analytics_occurred_idx ON analytics_events(occurred_at)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS analytics_traffic_idx ON analytics_events(traffic_type, source_group, occurred_at)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS analytics_geo_idx ON analytics_events(country_code, occurred_at)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS analytics_checkout_idx ON analytics_events(event_name, checkout_stage, occurred_at)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS analytics_item_variant_idx ON analytics_event_items(variant_id, event_name)",
			},
			{
				sql: "CREATE INDEX IF NOT EXISTS analytics_item_sku_idx ON analytics_event_items(sku, event_name)",
			},
		]);
	})();
	await schemaPromise;
}

export async function ensureAnalyticsSchema(): Promise<void> {
	await ensureSchema();
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

function isTrafficType(value: unknown): value is TrafficType {
	return value === "paid" || value === "organic" || value === "direct" || value === "referral" || value === "other";
}

function isDeviceType(value: unknown): value is "desktop" | "mobile" | "tablet" | "bot" | "unknown" {
	return value === "desktop" || value === "mobile" || value === "tablet" || value === "bot" || value === "unknown";
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
