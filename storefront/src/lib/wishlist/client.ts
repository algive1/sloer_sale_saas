"use client";

import type { WishlistRecord } from "@/lib/wishlist/types";
import { isValidWishlistRecord } from "@/lib/wishlist/validation";

const STORAGE_KEY = "paper.wishlist.v1";
const EVENT = "paper:wishlist-change";
let syncPromise: Promise<void> | null = null;

export function readWishlist(): WishlistRecord[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const items = JSON.parse(raw) as WishlistRecord[];
		return Array.isArray(items) ? items.filter(isValidWishlistRecord) : [];
	} catch {
		return [];
	}
}

export function subscribeWishlist(callback: () => void): () => void {
	window.addEventListener(EVENT, callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener(EVENT, callback);
		window.removeEventListener("storage", callback);
	};
}

export function wishlistSnapshot(): string {
	return JSON.stringify(readWishlist());
}

export function setWishlistItem(item: WishlistRecord, saved: boolean): void {
	if (!isValidWishlistRecord(item)) return;
	const items = readWishlist();
	const next = saved
		? [item, ...items.filter((current) => current.productId !== item.productId)]
		: items.filter((current) => current.productId !== item.productId);
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		window.dispatchEvent(new Event(EVENT));
	} catch {
		// Private browsing may reject storage; the UI remains usable for this click.
	}
	void fetch("/api/wishlist", {
		method: saved ? "POST" : "DELETE",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(saved ? item : { productId: item.productId }),
		credentials: "same-origin",
	}).catch(() => undefined);
}

export function syncWishlistFromServer(): Promise<void> {
	if (syncPromise) return syncPromise;
	syncPromise = fetch("/api/wishlist", { credentials: "same-origin" })
		.then(async (response) => {
			if (!response.ok) return;
			const payload = (await response.json()) as { items?: unknown[]; cloud?: boolean };
			if (!payload.cloud || !Array.isArray(payload.items)) return;
			const local = readWishlist();
			const remote = payload.items.filter(isValidWishlistRecord);
			const merged = new Map<string, WishlistRecord>();
			for (const item of [...remote, ...local]) merged.set(item.productId, item);
			const next = JSON.stringify([...merged.values()]);
			if (next !== wishlistSnapshot()) {
				window.localStorage.setItem(STORAGE_KEY, next);
				window.dispatchEvent(new Event(EVENT));
			}
			const remoteById = new Map(remote.map((item) => [item.productId, item]));
			for (const item of local) {
				// An unchanged server record needs no new SQL write.
				if (JSON.stringify(remoteById.get(item.productId)) === JSON.stringify(item)) continue;
				void fetch("/api/wishlist", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(item),
					credentials: "same-origin",
				});
			}
		})
		.catch(() => undefined)
		.finally(() => {
			syncPromise = null;
		});
	return syncPromise;
}
