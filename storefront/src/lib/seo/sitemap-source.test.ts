import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/graphql", () => ({ executeRawGraphQL: vi.fn() }));
import { executeRawGraphQL } from "@/lib/graphql";
import { fetchSitemapCatalogSlugs } from "./sitemap-source";
const connection = (nodes: unknown[], next = false, cursor?: string) => ({
	edges: nodes.map((node) => ({ node })),
	pageInfo: { hasNextPage: next, endCursor: cursor },
});
afterEach(() => {
	vi.resetAllMocks();
});
it("keeps every product page and localized slug, scopes markets, filters empty categories and opts into complete timed reads", async () => {
	vi.mocked(executeRawGraphQL).mockImplementation(async (input) => {
		if (input.query.includes("SitemapProducts"))
			return {
				ok: true,
				data: {
					products: input.variables?.after
						? connection([{ slug: "second" }])
						: connection([{ slug: "first", translation: { slug: "translated" } }], true, "next"),
				},
			};
		if (input.query.includes("SitemapCategories"))
			return {
				ok: true,
				data: {
					categories: connection([
						{ slug: "live", products: { totalCount: 2 } },
						{ slug: "empty", products: { totalCount: 0 } },
					]),
				},
			};
		return { ok: true, data: { collections: connection([]) } };
	});
	expect(await fetchSitemapCatalogSlugs("us", "en")).toEqual({
		products: ["translated", "second"],
		categories: ["live"],
		collections: [],
	});
	for (const [input] of vi.mocked(executeRawGraphQL).mock.calls) {
		expect(input.variables?.channel).toBe("us");
		expect(input.variables?.first).toBe(100);
		expect(input.rejectPartialData).toBe(true);
		expect(input.timeoutMs).toBeLessThanOrEqual(8000);
	}
});
it("never turns partial/unavailable source data into a successful empty sitemap or leaks upstream messages", async () => {
	vi.mocked(executeRawGraphQL).mockResolvedValue({
		ok: false,
		error: { type: "graphql", message: "private upstream failure", isRetryable: false },
	});
	await expect(fetchSitemapCatalogSlugs("us", "en")).rejects.toThrow("Products unavailable for us");
	vi.mocked(executeRawGraphQL).mockResolvedValue({
		ok: true,
		data: { products: null, categories: null, collections: null },
	});
	await expect(fetchSitemapCatalogSlugs("us", "en")).rejects.toThrow("Products unavailable for us");
});
