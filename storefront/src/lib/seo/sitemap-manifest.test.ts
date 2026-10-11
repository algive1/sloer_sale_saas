import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("./sitemap-page", () => ({ readSitemapPage: vi.fn() }));
import { readSitemapPage, type SitemapPage } from "./sitemap-page";
import { readSitemapChunk, scanSitemapChunks } from "./sitemap-manifest";
import { sitemapFailure, sitemapXml } from "./sitemap-xml";
import { redirect } from "next/navigation";
const page = (slugs: string[], next = false, cursor: string | null = null): SitemapPage => ({ slugs, rows: slugs.length, next, cursor });
afterEach(() => vi.restoreAllMocks());
it("stores cursor ranges instead of catalog payloads and creates complete 1000 URL chunks", async () => {
	const calls: Array<string | null> = [];
	const chunks = await scanSitemapChunks(async (after) => {
		calls.push(after);
		const number = after ? Number(after) : 0;
		return page(Array.from({ length: number === 20 ? 1 : 100 }, (_, i) => `p-${number * 100 + i}`), number < 20, String(number + 1));
	});
	expect(chunks).toEqual([{ after: null, pages: 10, count: 1000 }, { after: "10", pages: 10, count: 1000 }, { after: "20", pages: 1, count: 1 }]);
	expect(calls).toHaveLength(21);
	expect(JSON.stringify(chunks)).not.toContain("p-");
});
it("does not advertise empty category chunks and retains the actual cursor start of later ones", async () => {
	const chunks = await scanSitemapChunks(async (after) => {
		const number = after ? Number(after) : 0;
		return { ...page(number === 10 ? ["live-category"] : [], number < 10, String(number + 1)), rows: 100 };
	});
	expect(chunks).toEqual([{ after: "10", pages: 1, count: 1 }]);
});
it("rejects repeated localized identities across chunks and cursor cycles", async () => {
	let count = 0;
	await expect(scanSitemapChunks(async () => page(["same"], ++count < 2, String(count)), { maxPages: 10, chunkPages: 1, budgetMs: 60_000 })).rejects.toThrow("repeated_identity");
	count = 0;
	await expect(scanSitemapChunks(async () => page([String(++count)], true, "same"))).rejects.toThrow("no_progress");
});
it("refuses successful manifests after time/page limits instead of silently truncating", async () => {
	await expect(scanSitemapChunks(async (after) => page([after ?? "first"], true, after ? after + "1" : "1"), { maxPages: 2, chunkPages: 1, budgetMs: 60_000 })).rejects.toThrow("page_limit");
	let now = 0;
	vi.spyOn(Date, "now").mockImplementation(() => now);
	await expect(scanSitemapChunks(async () => { now = 60_001; return page(["late"]); })).rejects.toThrow("budget");
});
it("reads only this chunk, detects changed length/early termination and never starts from the first global product", async () => {
	vi.mocked(readSitemapPage).mockResolvedValueOnce(page(["second"], true, "end")).mockResolvedValueOnce(page(["third"]));
	expect(await readSitemapChunk("us", "de", "products", { after: "start", pages: 2, count: 2 })).toEqual(["second", "third"]);
	expect(vi.mocked(readSitemapPage).mock.calls.map((args) => args[3])).toEqual(["start", "end"]);
	vi.mocked(readSitemapPage).mockResolvedValue(page(["early"]));
	await expect(readSitemapChunk("us", "de", "products", { after: "start", pages: 2, count: 2 })).rejects.toThrow("changed");
	await expect(readSitemapChunk("us", "de", "products", { after: "start", pages: 1, count: 2 })).rejects.toThrow("changed");
});
it("escapes index/url XML and enforces address and UTF-8 byte limits independently", () => {
	expect(sitemapXml(["https://brand.test/?a=1&b=<\"'>"], true)).toContain("&amp;b=&lt;&quot;&apos;&gt;");
	expect(sitemapXml(["https://brand.test/en/us"], false)).toContain("<urlset ");
	expect(() => sitemapXml(Array.from({ length: 50_001 }, () => "https://brand.test"), true)).toThrow("partitioning");
	expect(() => sitemapXml(["https://brand.test/" + "字".repeat(17_000_000)], false)).toThrow("partitioning");
});
it("lets actual Next runtime control flow escape instead of caching a successful static error shell", () => {
	let internal: unknown;
	try { redirect("/en/us"); } catch (error) { internal = error; }
	expect(internal).toBeTruthy();
	expect(() => sitemapFailure(internal)).toThrow();
	expect(sitemapFailure(new Error("private application error")).status).toBe(503);
});
