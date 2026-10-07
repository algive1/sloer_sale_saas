import "server-only";

import { analyticsDatabaseConfigured, hranaRowsToObjects, libsqlPipeline } from "@/lib/analytics/libsql-http";

export type WishlistRecord = {
	productId: string;
	variantId?: string;
	name: string;
	href: string;
	image?: string;
	price: number;
	currency: string;
	channel: string;
};

let schemaPromise: Promise<void> | null = null;

export function wishlistCloudConfigured(): boolean {
	return analyticsDatabaseConfigured();
}

export async function listWishlist(ownerKey: string): Promise<WishlistRecord[]> {
	if (!wishlistCloudConfigured()) return [];
	await ensureSchema();
	const [result] = await libsqlPipeline([{
		sql: "SELECT payload_json FROM wishlist_items WHERE owner_key = ? ORDER BY updated_at DESC",
		args: [ownerKey],
		wantRows: true,
	}]);
	return hranaRowsToObjects(result)
		.map((row) => parseRecord(String(row.payload_json ?? "")))
		.filter((item): item is WishlistRecord => item !== null);
}

export async function upsertWishlist(ownerKey: string, item: WishlistRecord): Promise<void> {
	if (!wishlistCloudConfigured()) return;
	await ensureSchema();
	await libsqlPipeline([{
		sql: `INSERT INTO wishlist_items(owner_key, product_id, payload_json, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(owner_key, product_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
		args: [ownerKey, item.productId, JSON.stringify(item), new Date().toISOString(), new Date().toISOString()],
	}]);
}

export async function removeWishlist(ownerKey: string, productId: string): Promise<void> {
	if (!wishlistCloudConfigured()) return;
	await ensureSchema();
	await libsqlPipeline([{
		sql: "DELETE FROM wishlist_items WHERE owner_key = ? AND product_id = ?",
		args: [ownerKey, productId],
	}]);
}

export async function mergeWishlistOwners(fromOwner: string, toOwner: string): Promise<void> {
	if (!wishlistCloudConfigured() || fromOwner === toOwner) return;
	await ensureSchema();
	await libsqlPipeline([
		{
			sql: `INSERT INTO wishlist_items(owner_key, product_id, payload_json, created_at, updated_at)
				SELECT ?, product_id, payload_json, created_at, updated_at FROM wishlist_items WHERE owner_key = ?
				ON CONFLICT(owner_key, product_id) DO UPDATE SET
				payload_json = excluded.payload_json,
				updated_at = CASE WHEN excluded.updated_at > wishlist_items.updated_at THEN excluded.updated_at ELSE wishlist_items.updated_at END`,
			args: [toOwner, fromOwner],
		},
		{ sql: "DELETE FROM wishlist_items WHERE owner_key = ?", args: [fromOwner] },
	]);
}

async function ensureSchema(): Promise<void> {
	schemaPromise ??= libsqlPipeline([
		{
			sql: `CREATE TABLE IF NOT EXISTS wishlist_items (
				owner_key TEXT NOT NULL,
				product_id TEXT NOT NULL,
				payload_json TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY(owner_key, product_id)
			)`,
		},
	]).then(() => undefined);
	await schemaPromise;
}

function parseRecord(raw: string): WishlistRecord | null {
	try {
		const value = JSON.parse(raw) as WishlistRecord;
		return value && typeof value.productId === "string" && typeof value.name === "string" ? value : null;
	} catch {
		return null;
	}
}
