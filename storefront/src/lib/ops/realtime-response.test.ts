import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./current-viewer.server", () => ({ currentOpsViewer: vi.fn() }));
vi.mock("@/lib/storage/libsql-http", () => ({ analyticsDatabaseConfigured: vi.fn(() => true) }));
vi.mock("@/plugins/analytics/realtime-report", () => ({ readRealtimeAnalytics: vi.fn(async () => ({ summary: { events: 2 } })) }));
import { currentOpsViewer } from "./current-viewer.server";
import { readRealtimeAnalytics } from "@/plugins/analytics/realtime-report";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";
import { GET as brandGET } from "@/app/ops/sites/[siteId]/realtime/api/route";
import { GET as platformGET } from "@/app/ops/api/analytics/realtime/route";
const request = new Request("https://ops.example/ops/sites/fashion/realtime/api?channel=jewelry-us");
const get = (siteId: string) => brandGET(request, { params: Promise.resolve({ siteId }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(analyticsDatabaseConfigured).mockReturnValue(true);
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([
    { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us", "fashion-eu"], defaultChannel: "fashion-us" },
    { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
  ]));
  vi.mocked(currentOpsViewer).mockResolvedValue({ username: "reader", role: "brand_analyst", siteIds: ["fashion"] });
});
afterEach(() => vi.unstubAllEnvs());
it("reauthorizes scope even without middleware and ignores query-provided channels", async () => {
  const response = await get("fashion"); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(readRealtimeAnalytics).toHaveBeenCalledWith(expect.any(Date), ["fashion-us", "fashion-eu"]);
  expect((await get("jewelry")).status).toBe(403); expect((await platformGET()).status).toBe(403);
  expect(readRealtimeAnalytics).toHaveBeenCalledTimes(1);
  vi.mocked(currentOpsViewer).mockResolvedValue(null); expect((await get("fashion")).status).toBe(403);
});
it("unknown site and database failure never fall back to platform totals", async () => {
  vi.mocked(currentOpsViewer).mockResolvedValue({ username: "owner", role: "platform_admin", siteIds: [] });
  expect((await get("unknown")).status).toBe(404); expect(readRealtimeAnalytics).not.toHaveBeenCalled();
  vi.mocked(analyticsDatabaseConfigured).mockReturnValue(false); expect((await get("fashion")).status).toBe(503);
  vi.mocked(analyticsDatabaseConfigured).mockReturnValue(true); vi.mocked(readRealtimeAnalytics).mockRejectedValueOnce(new Error("database down"));
  expect((await get("fashion")).status).toBe(503); expect(readRealtimeAnalytics).toHaveBeenCalledTimes(1);
  expect((await platformGET()).status).toBe(200); expect(readRealtimeAnalytics).toHaveBeenLastCalledWith(expect.any(Date), null);
});
