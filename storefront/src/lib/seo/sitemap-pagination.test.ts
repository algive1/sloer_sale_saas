import { afterEach, expect, it, vi } from "vitest";
import { collectSitemapConnection, type SitemapConnection } from "./sitemap-pagination";
import { assertSitemapSize } from "./sitemap-size";
const page = (slugs: string[], next = false, cursor?: string | null): SitemapConnection<string> => ({
	edges: slugs.map((node) => ({ node })),
	pageInfo: { hasNextPage: next, endCursor: cursor },
});
const key = (slug: string) => slug;
afterEach(() => {
	vi.restoreAllMocks();
});
it("collects every page, forwards actual cursors and allows an empty complete catalog", async () => {
	const fetchPage = vi
		.fn()
		.mockResolvedValueOnce(page(["a", "b"], true, "cursor-a"))
		.mockResolvedValueOnce(page(["c"], true, "cursor-b"))
		.mockResolvedValueOnce(page(["d"]));
	expect(await collectSitemapConnection(fetchPage, key)).toEqual(["a", "b", "c", "d"]);
	expect(fetchPage.mock.calls.map((args) => args[0])).toEqual([null, "cursor-a", "cursor-b"]);
	expect(await collectSitemapConnection(async () => page([]), key)).toEqual([]);
});
it("rejects a promised next page with missing cursor, empty progress or cursor cycles", async () => {
	for (const bad of [page(["a"], true), page(["a"], true, ""), page([], true, "next")])
		await expect(collectSitemapConnection(async () => bad, key)).rejects.toThrow("no_progress");
	const cyclic = vi
		.fn()
		.mockResolvedValueOnce(page(["a"], true, "one"))
		.mockResolvedValueOnce(page(["b"], true, "two"))
		.mockResolvedValueOnce(page(["c"], true, "one"));
	await expect(collectSitemapConnection(cyclic, key)).rejects.toThrow("no_progress");
	expect(cyclic).toHaveBeenCalledTimes(3);
});
it("rejects malformed, oversized, duplicate or colliding canonical identities", async () => {
	for (const bad of [
		page([""]),
		page(["same", "same"]),
		page(Array.from({ length: 101 }, (_, i) => String(i))),
		{ edges: [{ node: null }], pageInfo: { hasNextPage: false } },
		{ edges: [], pageInfo: { hasNextPage: undefined } },
	])
		await expect(
			collectSitemapConnection(async () => bad as SitemapConnection<string>, key),
		).rejects.toThrow();
	const repeated = vi
		.fn()
		.mockResolvedValueOnce(page(["same"], true, "next"))
		.mockResolvedValueOnce(page(["same"]));
	await expect(collectSitemapConnection(repeated, key)).rejects.toThrow("identity_invalid_or_repeated");
});
it("fails explicitly at the page budget without publishing the first part as complete", async () => {
	const fetchPage = vi
		.fn()
		.mockResolvedValueOnce(page(["a"], true, "one"))
		.mockResolvedValueOnce(page(["b"], true, "two"));
	await expect(
		collectSitemapConnection(fetchPage, key, {
			pageSize: 100,
			maxPages: 2,
			budgetMs: 60_000,
			pageTimeoutMs: 8_000,
		}),
	).rejects.toThrow("requires_partitioning");
	expect(fetchPage).toHaveBeenCalledTimes(2);
});
it("shrinks the last request timeout and stops before another I/O once the time budget expires", async () => {
	let now = 100;
	vi.spyOn(Date, "now").mockImplementation(() => now);
	const fetchPage = vi.fn(async () => {
		now = 59_100;
		return page(["a"], true, "one");
	});
	fetchPage
		.mockImplementationOnce(async () => {
			now = 59_100;
			return page(["a"], true, "one");
		})
		.mockImplementationOnce(async () => {
			now = 60_101;
			return page(["b"], true, "two");
		});
	await expect(collectSitemapConnection(fetchPage, key)).rejects.toThrow("budget_exceeded");
	expect(fetchPage.mock.calls).toHaveLength(2);
	expect(fetchPage.mock.calls[1]).toEqual(["one", 1000]);
});
it("rejects a sitemap exceeding combined URL or escaped byte limits", () => {
	expect(() =>
		assertSitemapSize(Array.from({ length: 50_000 }, () => ({ url: "https://brand.test/en/us" }))),
	).not.toThrow();
	expect(() =>
		assertSitemapSize(Array.from({ length: 50_001 }, () => ({ url: "https://brand.test/en/us" }))),
	).toThrow("requires_partitioning");
	expect(() =>
		assertSitemapSize(
			Array.from({ length: 20_000 }, () => ({ url: "https://brand.test/" + "&".repeat(500) })),
		),
	).toThrow("requires_partitioning");
});
