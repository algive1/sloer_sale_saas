import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
const source = vi.hoisted(() => ({ channels: vi.fn(), products: vi.fn() }));
vi.mock("@/lib/channel-slugs", () => ({ getStorefrontChannelSlugs: source.channels }));
vi.mock("@/lib/merchant/google-feed-source", () => ({ fetchGoogleMerchantProducts: source.products }));
import { GET } from "./route";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("pauses the optional feed before catalog queries while preserving unknown-host protection", async () => {
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '["seo-merchant"]');
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([{ id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["us"], defaultChannel: "us" }]));
  const own = await GET(new Request("https://fashion.example/merchant/google.xml", { headers: { host: "fashion.example" } }));
  expect(own.status).toBe(503); expect(own.headers.get("cache-control")).toContain("no-store");
  expect((await GET(new Request("https://other.example/merchant/google.xml", { headers: { host: "other.example" } }))).status).toBe(404);
  expect(source.channels).not.toHaveBeenCalled(); expect(source.products).not.toHaveBeenCalled();
});
