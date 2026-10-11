import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { readSitemapPage, type SitemapEntity, type SitemapPage } from "./sitemap-page";

export type SitemapChunk = { after: string | null; pages: number; count: number };
export async function scanSitemapChunks(
	fetchPage: (after: string | null) => Promise<SitemapPage>,
	limits = { maxPages: 500, chunkPages: 10, budgetMs: 60_000 },
): Promise<SitemapChunk[]> {
	const started = Date.now();
	const cursors = new Set<string>();
	// Detect translated-slug collisions without retaining full nodes or URLs.
	const identities = new Set<string>();
	const chunks: SitemapChunk[] = [];
	let after: string | null = null;
	let chunk: SitemapChunk = { after, pages: 0, count: 0 };
	for (let pageNumber = 0; pageNumber < limits.maxPages; pageNumber++) {
		if (Date.now() - started >= limits.budgetMs) throw new Error("sitemap_manifest_budget_exceeded");
		const page = await fetchPage(after);
		if (Date.now() - started >= limits.budgetMs) throw new Error("sitemap_manifest_budget_exceeded");
		for (const slug of page.slugs) {
			const identity = createHash("sha256").update(slug).digest("hex");
			if (identities.has(identity)) throw new Error("sitemap_manifest_repeated_identity");
			identities.add(identity);
		}
		chunk.pages++;
		chunk.count += page.slugs.length;
		if (chunk.pages === limits.chunkPages || !page.next) {
			if (chunk.count > 0) chunks.push(chunk);
			chunk = { after: page.cursor, pages: 0, count: 0 };
		}
		if (!page.next) return chunks;
		if (!page.cursor || cursors.has(page.cursor)) throw new Error("sitemap_manifest_no_progress");
		cursors.add(page.cursor);
		after = page.cursor;
	}
	throw new Error("sitemap_manifest_page_limit_exceeded");
}

export async function readSitemapManifest(channel: string, locale: string, entity: SitemapEntity): Promise<SitemapChunk[]> {
	"use cache";
	cacheLife("catalog");
	cacheTag("products", "categories", "collections");
	return scanSitemapChunks((after) => readSitemapPage(channel, locale, entity, after));
}

/** Fetch only this chunk's bounded pages; refuse a stale/inconsistent success. */
export async function readSitemapChunk(channel: string, locale: string, entity: SitemapEntity, chunk: SitemapChunk): Promise<string[]> {
	const slugs: string[] = [];
	const seen = new Set<string>();
	let after = chunk.after;
	for (let pageNumber = 0; pageNumber < chunk.pages; pageNumber++) {
		const page = await readSitemapPage(channel, locale, entity, after);
		for (const slug of page.slugs) {
			if (seen.has(slug)) throw new Error("sitemap_chunk_repeated_identity");
			seen.add(slug);
			slugs.push(slug);
		}
		if (pageNumber + 1 < chunk.pages && !page.next) throw new Error("sitemap_chunk_changed");
		after = page.cursor;
	}
	if (slugs.length !== chunk.count) throw new Error("sitemap_chunk_changed");
	return slugs;
}
