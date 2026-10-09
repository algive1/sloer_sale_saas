import "server-only";

import { ensureAnalyticsSchema } from "@/plugins/analytics/first-party-store";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { withAnalyticsChannelScope } from "./scoped-statements";

export type ProductBucket = "hour" | "day";
export type ProductMoney = { currency: string; value: number };

export type ProductPerformanceRow = {
	itemKey: string;
    productId?:string;
	itemName: string;
	categoryId: string;
	categoryName: string;
	thumbnailUrl: string;
	sku: string;
	productViews: number;
	wishlists: number;
	addToCarts: number;
	checkouts: number;
	purchaseSessions: number;
	unitsSold: number;
	purchasedItemValue: ProductMoney[];
};

export type ProductReport = {
	summary: {
		trackedProducts: number;
		productViewSessions: number;
		addToCartSessions: number;
		purchaseSessions: number;
		unitsSold: number;
	};
	products: ProductPerformanceRow[];
	trend: Array<{
		bucket: string;
		itemKey: string;
		views: number;
		carts: number;
		purchases: number;
	}>;
};

export async function readProductReport(input: {
	from: Date;
	to: Date;
	bucket: ProductBucket;
	channels?: readonly string[] | null;
}): Promise<ProductReport> {
	await ensureAnalyticsSchema();
	const from = input.from.toISOString();
	const to = input.to.toISOString();
	const itemKey = "COALESCE(NULLIF(ai.product_id, ''), NULLIF(ai.item_id, ''), NULLIF(ai.variant_id, ''))";
	const sessionKey = "COALESCE(ae.session_id, ae.event_id)";
	const bucketExpr =
		input.bucket === "hour"
			? "substr(ae.occurred_at, 1, 13) || ':00'"
			: "substr(ae.occurred_at, 1, 10)";

	const [summaryResult, productsResult, revenueResult, trendResult] = await libsqlPipeline(withAnalyticsChannelScope([
		{
			sql: `SELECT
				COUNT(DISTINCT ${itemKey}) AS tracked_products,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_viewed' THEN ${sessionKey} END) AS product_view_sessions,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_added_to_cart' THEN ${sessionKey} END) AS add_to_cart_sessions,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'checkout_completed' THEN ${sessionKey} END) AS purchase_sessions,
				COALESCE(SUM(CASE WHEN ae.event_name = 'checkout_completed' THEN ai.quantity ELSE 0 END), 0) AS units_sold
			FROM analytics_event_items ai
			JOIN analytics_events ae
				ON ae.event_name = ai.event_name AND ae.event_id = ai.event_id
			WHERE ae.occurred_at >= ? AND ae.occurred_at < ?
				AND COALESCE(ae.device_type, '') != 'bot'`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				${itemKey} AS item_key,
                COALESCE(MAX(NULLIF(ai.product_id, '')), '') AS product_id,
				COALESCE(MAX(NULLIF(ai.item_name, '')), ${itemKey}) AS item_name,
				COALESCE(MAX(NULLIF(ai.category_id, '')), '') AS category_id,
				COALESCE(MAX(NULLIF(ai.category_name, '')), '') AS category_name,
				COALESCE(MAX(NULLIF(ai.image_url, '')), '') AS thumbnail_url,
				COALESCE(MAX(NULLIF(ai.sku, '')), '') AS sku,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_viewed' THEN ${sessionKey} END) AS product_views,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'wishlist_added' THEN ${sessionKey} END) AS wishlists,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_added_to_cart' THEN ${sessionKey} END) AS add_to_carts,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'checkout_started' THEN ${sessionKey} END) AS checkouts,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'checkout_completed' THEN ${sessionKey} END) AS purchase_sessions,
				COALESCE(SUM(CASE WHEN ae.event_name = 'checkout_completed' THEN ai.quantity ELSE 0 END), 0) AS units_sold
			FROM analytics_event_items ai
			JOIN analytics_events ae
				ON ae.event_name = ai.event_name AND ae.event_id = ai.event_id
			WHERE ae.occurred_at >= ? AND ae.occurred_at < ?
				AND COALESCE(ae.device_type, '') != 'bot'
			GROUP BY ${itemKey}
			ORDER BY product_views DESC, add_to_carts DESC, purchase_sessions DESC
			LIMIT 100`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `SELECT
				${itemKey} AS item_key,
				COALESCE(NULLIF(ae.currency, ''), 'UNKNOWN') AS currency,
				COALESCE(SUM(COALESCE(ai.price, 0) * ai.quantity), 0) AS item_value
			FROM analytics_event_items ai
			JOIN analytics_events ae
				ON ae.event_name = ai.event_name AND ae.event_id = ai.event_id
			WHERE ae.occurred_at >= ? AND ae.occurred_at < ?
				AND COALESCE(ae.device_type, '') != 'bot'
				AND ae.event_name = 'checkout_completed'
			GROUP BY ${itemKey}, COALESCE(NULLIF(ae.currency, ''), 'UNKNOWN')
			ORDER BY item_value DESC`,
			args: [from, to],
			wantRows: true,
		},
		{
			sql: `WITH top_items AS (
				SELECT ${itemKey} AS item_key
				FROM analytics_event_items ai
				JOIN analytics_events ae
					ON ae.event_name = ai.event_name AND ae.event_id = ai.event_id
				WHERE ae.occurred_at >= ? AND ae.occurred_at < ?
					AND COALESCE(ae.device_type, '') != 'bot'
					AND ae.event_name = 'product_viewed'
				GROUP BY ${itemKey}
				ORDER BY COUNT(DISTINCT ${sessionKey}) DESC
				LIMIT 5
			)
			SELECT
				${bucketExpr} AS bucket,
				${itemKey} AS item_key,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_viewed' THEN ${sessionKey} END) AS views,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'product_added_to_cart' THEN ${sessionKey} END) AS carts,
				COUNT(DISTINCT CASE WHEN ae.event_name = 'checkout_completed' THEN ${sessionKey} END) AS purchases
			FROM analytics_event_items ai
			JOIN analytics_events ae
				ON ae.event_name = ai.event_name AND ae.event_id = ai.event_id
			WHERE ae.occurred_at >= ? AND ae.occurred_at < ?
				AND COALESCE(ae.device_type, '') != 'bot'
				AND ${itemKey} IN (SELECT item_key FROM top_items)
			GROUP BY ${bucketExpr}, ${itemKey}
			ORDER BY bucket ASC`,
			args: [from, to, from, to],
			wantRows: true,
		},
	], input.channels ?? null));

	const moneyByProduct = new Map<string, ProductMoney[]>();
	for (const row of hranaRowsToObjects(revenueResult)) {
		const key = String(row.item_key ?? "");
		const values = moneyByProduct.get(key) ?? [];
		values.push({
			currency: String(row.currency ?? "UNKNOWN"),
			value: Number(row.item_value ?? 0),
		});
		moneyByProduct.set(key, values);
	}

	const products = hranaRowsToObjects(productsResult).map((row): ProductPerformanceRow => {
		const key = String(row.item_key ?? "");
		return {
			itemKey: key,
            productId:String(row.product_id??""),
			itemName: String(row.item_name ?? key),
			categoryId: String(row.category_id ?? ""),
			categoryName: String(row.category_name ?? ""),
			thumbnailUrl: String(row.thumbnail_url ?? ""),
			sku: String(row.sku ?? ""),
			productViews: Number(row.product_views ?? 0),
			wishlists: Number(row.wishlists ?? 0),
			addToCarts: Number(row.add_to_carts ?? 0),
			checkouts: Number(row.checkouts ?? 0),
			purchaseSessions: Number(row.purchase_sessions ?? 0),
			unitsSold: Number(row.units_sold ?? 0),
			purchasedItemValue: moneyByProduct.get(key) ?? [],
		};
	});

	const topKeys = products
		.filter((row) => row.productViews > 0)
		.slice(0, 5)
		.map((row) => row.itemKey);

	const rawTrend = hranaRowsToObjects(trendResult).map((row) => ({
		bucket: String(row.bucket ?? ""),
		itemKey: String(row.item_key ?? ""),
		views: Number(row.views ?? 0),
		carts: Number(row.carts ?? 0),
		purchases: Number(row.purchases ?? 0),
	}));

	const summary = hranaRowsToObjects(summaryResult)[0] ?? {};
	return {
		summary: {
			trackedProducts: Number(summary.tracked_products ?? 0),
			productViewSessions: Number(summary.product_view_sessions ?? 0),
			addToCartSessions: Number(summary.add_to_cart_sessions ?? 0),
			purchaseSessions: Number(summary.purchase_sessions ?? 0),
			unitsSold: Number(summary.units_sold ?? 0),
		},
		products,
		trend: fillProductTrendGaps(rawTrend, topKeys, input.from, input.to, input.bucket),
	};
}

function fillProductTrendGaps(
	rows: ProductReport["trend"],
	itemKeys: string[],
	from: Date,
	to: Date,
	bucket: ProductBucket,
): ProductReport["trend"] {
	if (to <= from || itemKeys.length === 0) return rows;
	const byKey = new Map(rows.map((row) => [`${row.bucket}:${row.itemKey}`, row]));
	const cursor = floorUtc(from, bucket);
	const last = floorUtc(new Date(to.getTime() - 1), bucket);
	const result: ProductReport["trend"] = [];

	while (cursor <= last) {
		const bucketKey = formatBucketKey(cursor, bucket);
		for (const itemKey of itemKeys) {
			result.push(
				byKey.get(`${bucketKey}:${itemKey}`) ?? {
					bucket: bucketKey,
					itemKey,
					views: 0,
					carts: 0,
					purchases: 0,
				},
			);
		}
		if (bucket === "hour") cursor.setUTCHours(cursor.getUTCHours() + 1);
		else cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return result;
}

function floorUtc(date: Date, bucket: ProductBucket): Date {
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

function formatBucketKey(date: Date, bucket: ProductBucket): string {
	const iso = date.toISOString();
	return bucket === "hour" ? `${iso.slice(0, 13)}:00` : iso.slice(0, 10);
}
