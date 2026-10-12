import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/graphql", () => ({ executeRawGraphQL: vi.fn() }));
import { executeRawGraphQL } from "@/lib/graphql";
import { readSitemapPage } from "./sitemap-page";
const items = (nodes: unknown[], next = false, cursor?: string) => ({ edges: nodes.map((node) => ({ node })), pageInfo: { hasNextPage: next, endCursor: cursor } });
afterEach(() => vi.resetAllMocks());
it("uses bounded complete native reads, localizes per language and filters actual empty categories", async () => {
	vi.mocked(executeRawGraphQL).mockResolvedValue({ ok: true, data: { items: items([{ slug: "first", translation: { slug: "translated" }, products: { totalCount: 1 } }, { slug: "empty", products: { totalCount: 0 } }]) } });
	expect(await readSitemapPage("us", "de", "categories", "previous")).toMatchObject({ slugs: ["translated"], rows: 2, next: false });
	const input = vi.mocked(executeRawGraphQL).mock.calls[0][0];
	expect(input.variables).toMatchObject({ channel: "us", language: "DE", after: "previous" });
	expect(input.query).toContain("categories(first: 100");
	expect(input.query).toContain("products(first: 1, channel: $channel)");
	expect(input).toMatchObject({ timeoutMs: 8000, rejectPartialData: true });
});
it("rejects missing pages, invalid nodes/counts, repeated identities and empty/corrupt progress", async () => {
	for (const connection of [undefined, items([{ slug: "" }]), items([{ slug: "a" }, { slug: "a" }]), items([], true, "next"), items([{ slug: "a" }], true, "previous"), items([{ slug: "a", products: {} }])]) {
		vi.mocked(executeRawGraphQL).mockResolvedValue({ ok: true, data: { items: connection } });
		await expect(readSitemapPage("us", "en", "categories", "previous")).rejects.toThrow("sitemap_");
	}
	vi.mocked(executeRawGraphQL).mockResolvedValue({ ok: false, error: { type: "graphql", message: "private failure", isRetryable: false } });
	await expect(readSitemapPage("us", "en", "products", null)).rejects.toThrow("sitemap_page_unavailable");
});
