import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ops/current-viewer.server", () => ({ currentOpsViewer: vi.fn() }));
vi.mock("@/lib/ops/tracking", () => ({ commitTrackingCsv: vi.fn(), previewTrackingCsv: vi.fn(), readTrackingQueue: vi.fn(), trackingHistory: vi.fn() }));
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { commitTrackingCsv, previewTrackingCsv, readTrackingQueue } from "@/lib/ops/tracking";
import { GET, POST } from "./route";
const ctx = { params: Promise.resolve({ siteId: "fashion" }) };
const data = { action: "preview", channel: "us", csv: "fixture" };
function request(headers: Record<string, string> = {}, body = JSON.stringify(data)) { return new Request("https://ops.example/ops/sites/fashion/tracking/api", { method: "POST", headers: { host: "ops.example", origin: "https://ops.example", "x-requested-with": "tracking-import", ...headers }, body }); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(currentOpsViewer).mockResolvedValue({ username: "owner", role: "platform_admin", siteIds: [] }); });
it("rejects shared/analyst identity, cross-origin requests and streaming oversized body before writes", async () => {
  const attempts: Array<Record<string, string>> = [{ origin: "https://foreign.example" }, { "x-requested-with": "" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of attempts) expect((await POST(request(headers), ctx)).status).toBe(403);
  expect((await POST(request({ "content-length": "70001" }), ctx)).status).toBe(413); expect((await POST(request({}, " ".repeat(70001)), ctx)).status).toBe(413);
  for (const viewer of [null, { username: "analytics", role: "platform_admin" as const, siteIds: [] }, { username: "reader", role: "brand_analyst" as const, siteIds: ["fashion"] }]) { vi.mocked(currentOpsViewer).mockResolvedValue(viewer); expect((await POST(request(), ctx)).status).toBe(403); }
  expect(commitTrackingCsv).not.toHaveBeenCalled(); expect(previewTrackingCsv).not.toHaveBeenCalled();
});
it("separates preview from commit and requires explicit confirmation plus a saved preview", async () => {
  vi.mocked(previewTrackingCsv).mockResolvedValue({ id: "preview", expiresAt: "fixture", rows: [], canSubmit: true });
  const preview = await POST(request(), ctx); expect(preview.status).toBe(200); expect(preview.headers.get("cache-control")).toContain("no-store"); expect(commitTrackingCsv).not.toHaveBeenCalled();
  for (const input of [{ ...data, action: "commit" }, { ...data, action: "commit", previewId: "preview", confirm: false }, { ...data, action: "drop" }, null]) expect((await POST(request({}, JSON.stringify(input)), ctx)).status).toBe(400);
  expect((await POST(request({}, "{"), ctx)).status).toBe(400);
  vi.mocked(commitTrackingCsv).mockResolvedValue({ rows: [] });
  expect((await POST(request({}, JSON.stringify({ ...data, action: "commit", previewId: "preview", confirm: true })), ctx)).status).toBe(200);
  expect(commitTrackingCsv).toHaveBeenCalledWith("fashion", expect.objectContaining({ username: "owner" }), "us", "fixture", "preview");
});
it("reports stale preview as conflict and hides secrets on source/history failure", async () => {
  vi.mocked(commitTrackingCsv).mockRejectedValue(new Error("tracking_preview_expired_or_changed"));
  expect((await POST(request({}, JSON.stringify({ ...data, action: "commit", previewId: "preview", confirm: true })), ctx)).status).toBe(409);
  vi.mocked(readTrackingQueue).mockRejectedValue(new Error("private upstream token"));
  const response = await GET(new Request("https://ops.example/ops/sites/fashion/tracking/api"), ctx); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private upstream");
});
