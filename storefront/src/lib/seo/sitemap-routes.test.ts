import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/seo/sitemap-manifest", () => ({ readSitemapManifest: vi.fn(), readSitemapChunk: vi.fn() }));
vi.mock("@/lib/channel-slugs", () => ({ getStorefrontChannelSlugs: vi.fn() }));
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { readSitemapChunk, readSitemapManifest } from "./sitemap-manifest";
import { GET as root } from "@/app/sitemap.xml/route";
import { GET as child } from "@/app/sitemaps/[id]/route";
import { sitemapPairKey } from "./sitemap-context";
const request = (host = "fashion.test") => new Request("https://" + host + "/sitemap.xml", { headers: { host } });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
function config() {
	vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([{ id: "fashion", name: "Fashion", domains: ["fashion.test"], channels: ["us"], defaultChannel: "us" }, { id: "jewelry", name: "Jewelry", domains: ["jewelry.test"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" }]));
	vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS", "en:us,de:us,en:jewelry-us,fr:jewelry-us");
	vi.mocked(readSitemapManifest).mockResolvedValue([{ after: null, pages: 1, count: 1 }]);
	vi.mocked(readSitemapChunk).mockResolvedValue(["native translated slug"]);
}
it("advertises only this host's paired language/market chunks and rejects unknown hosts before source lookup", async () => {
	config();
	const response = await root(request());
	expect(response.status).toBe(200);
	const xml = await response.text();
	expect(xml).toContain("<sitemapindex ");
	expect(xml).not.toContain("jewelry.test");
	expect(vi.mocked(readSitemapManifest).mock.calls.map(([channel]) => channel)).toEqual(Array(6).fill("us"));
	vi.mocked(readSitemapManifest).mockClear();
	expect((await root(request("unknown.test"))).status).toBe(404);
	expect(readSitemapManifest).not.toHaveBeenCalled();
	expect(getStorefrontChannelSlugs).not.toHaveBeenCalled();
});
it("keeps chunk ownership and IDs bound before source I/O and returns native localized URL data", async () => {
	config();
	const key = sitemapPairKey({ locale: "de", channel: "us" });
	expect((await child(request("jewelry.test"), context(key + "-products-0.xml"))).status).toBe(404);
	expect((await child(request(), context(key + "-products-00.xml"))).status).toBe(404);
	expect(readSitemapManifest).not.toHaveBeenCalled();
	const response = await child(request(), context(key + "-products-0.xml"));
	expect(await response.text()).toContain("https://fashion.test/de/us/products/native%20translated%20slug");
	expect(readSitemapChunk).toHaveBeenCalledWith("us", "de", "products", { after: null, pages: 1, count: 1 });
	expect((await child(request(), context(key + "-products-1.xml"))).status).toBe(404);
});
it("masks failed catalogs with retryable no-store errors rather than a truncated successful index", async () => {
	config();
	vi.mocked(readSitemapManifest).mockRejectedValue(new Error("private provider details"));
	const response = await root(request());
	expect(response.status).toBe(503);
	expect(response.headers.get("cache-control")).toBe("no-store");
	expect(response.headers.get("retry-after")).toBe("60");
	expect(await response.text()).not.toContain("private provider");
});
it("does not advertise a successful empty index when the known brand has no configured language/market pair", async () => {
	config();
	vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS", "fr:jewelry-us");
	expect((await root(request())).status).toBe(503);
	expect(readSitemapManifest).not.toHaveBeenCalled();
});
