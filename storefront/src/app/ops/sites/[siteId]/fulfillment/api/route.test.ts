import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ops/current-viewer.server", () => ({ currentOpsViewer: vi.fn() }));
vi.mock("@/lib/ops/fulfillment", () => ({ fulfillmentScope: vi.fn(() => ({ site: { id: "fashion" }, channel: "us" })), readFulfillmentSnapshot: vi.fn(), exportShippingCsv: vi.fn() }));
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { exportShippingCsv, readFulfillmentSnapshot } from "@/lib/ops/fulfillment";
import { GET, POST } from "./route";
const ctx = { params: Promise.resolve({ siteId: "fashion" }) };
const request = (headers: Record<string,string> = {}, body = JSON.stringify({ channel: "us", orderIds: ["order1"], confirm: true })) => new Request("https://ops.example/ops/sites/fashion/fulfillment/api", { method: "POST", headers: { host: "ops.example", origin: "https://ops.example", "x-requested-with": "shipping-export", ...headers }, body });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(currentOpsViewer).mockResolvedValue({ username: "owner", role: "platform_admin", siteIds: [] }); vi.mocked(exportShippingCsv).mockResolvedValue({ csv: "fixture", rows: 1, exportId: "audit1" }); });
it("rejects CSRF, shared admin, analysts and oversized data before exporting", async () => {
  const attempts: Array<Record<string,string>> = [{ origin: "https://foreign.example" }, { "x-requested-with": "" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of attempts) expect((await POST(request(headers), ctx)).status).toBe(403);
  expect((await POST(request({ "content-length": "12001" }), ctx)).status).toBe(413);
  expect((await POST(request({}, " ".repeat(12001)), ctx)).status).toBe(413);
  for (const viewer of [{ username: "analytics", role: "platform_admin" as const, siteIds: [] }, { username: "reader", role: "brand_analyst" as const, siteIds: ["fashion"] }, null]) { vi.mocked(currentOpsViewer).mockResolvedValue(viewer); expect((await POST(request(), ctx)).status).toBe(403); }
  expect(exportShippingCsv).not.toHaveBeenCalled();
});
it("requires explicit purpose confirmation and emits noncached CSV with audit reference", async () => {
  expect((await POST(request({}, JSON.stringify({ channel: "us", orderIds: ["order1"], confirm: false })), ctx)).status).toBe(400);
  expect((await POST(request({}, "{"), ctx)).status).toBe(400);
  const response = await POST(request(), ctx); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("x-shipping-export-id")).toBe("audit1"); expect(await response.text()).toBe("fixture");
});
it("reports changed orders explicitly and suppresses upstream secrets on errors", async () => {
  vi.mocked(exportShippingCsv).mockRejectedValue(new Error("export_orders_changed_reload")); expect((await POST(request(), ctx)).status).toBe(409);
  vi.mocked(readFulfillmentSnapshot).mockRejectedValue(new Error("private upstream secret"));
  const response = await GET(new Request("https://ops.example/ops/sites/fashion/fulfillment/api"), ctx); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private upstream");
});
