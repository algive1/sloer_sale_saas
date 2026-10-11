import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ops/current-viewer.server", () => ({ currentOpsViewer: vi.fn() }));
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { GET, POST } from "./route";
const context = (siteId = "fashion") => ({ params: Promise.resolve({ siteId }) });
const url = "https://ops.example/ops/sites/fashion/catalog/api";
const csv = "sku,channel,price,currency,weight_kg,image_url\nHAT,fashion-us,20.00,USD,0.25,https://images.example/hat.jpg";
const request = (body = csv, origin = "https://ops.example") => new Request(url, { method: "POST", headers: { host: "ops.example", origin, "x-requested-with": "catalog-validator" }, body });
beforeEach(() => {
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([{ id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us"], defaultChannel: "fashion-us" }, { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" }]));
  vi.mocked(currentOpsViewer).mockResolvedValue({ username: "reader", role: "brand_analyst", siteIds: ["fashion"] });
});
afterEach(() => vi.unstubAllEnvs());
it("allows only own-brand templates and denies validators for read-only staff", async () => {
  const own = await GET(new Request(url), context()); expect(own.status).toBe(200); expect(own.headers.get("cache-control")).toContain("no-store"); expect(await own.text()).toContain("fashion-us");
  expect((await GET(new Request(url), context("jewelry"))).status).toBe(403); expect((await POST(request(), context())).status).toBe(403);
  vi.mocked(currentOpsViewer).mockResolvedValue(null); expect((await GET(new Request(url), context())).status).toBe(403);
});
it("reauthorizes administrators, checks origin and validates server-owned channels", async () => {
  vi.mocked(currentOpsViewer).mockResolvedValue({ username: "owner", role: "platform_admin", siteIds: [] });
  expect((await POST(request(csv, "https://foreign.example"), context())).status).toBe(403);
  expect((await POST(new Request(url, { method: "POST", body: csv }), context())).status).toBe(403);
  const valid = await POST(request(), context()); expect(valid.status).toBe(200); expect(await valid.json()).toMatchObject({ valid: true, rows: 1 });
  const foreign = await POST(request(csv.replace("fashion-us", "jewelry-us")), context()); expect(await foreign.json()).toMatchObject({ valid: false });
  expect((await POST(request(), context("unknown"))).status).toBe(404);
});
it("rejects malformed and oversized requests without reflecting file content", async () => {
  vi.mocked(currentOpsViewer).mockResolvedValue({ username: "owner", role: "platform_admin", siteIds: [] });
  const invalid = await POST(request("private-sensitive-content"), context()); expect(invalid.status).toBe(400); expect(await invalid.text()).not.toContain("private-sensitive-content");
  const oversized = request(); oversized.headers.set("content-length", "1000001"); expect((await POST(oversized, context())).status).toBe(413);
});
