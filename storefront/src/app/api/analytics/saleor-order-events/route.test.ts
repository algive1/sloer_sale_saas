import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ verified: false, refund: vi.fn(), store: vi.fn(), deliver: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ verifyWebhookSignature: () => state.verified }));
vi.mock("@/plugins/analytics/first-party-store", () => ({ recordRefundTotal: state.refund, storeFirstPartyCommerceEvent: state.store }));
vi.mock("@/plugins/ads-tracking/server-ads", () => ({ deliverGa4ServerEvent: state.deliver }));
import { POST } from "./route";
afterEach(() => { state.verified = false; vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("retains signature authentication and explicitly reports paused refunds before parsing or SQL", async () => {
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '["analytics"]');
  const request = () => new NextRequest("https://shop.example/api/analytics/saleor-order-events", { method: "POST", headers: { "saleor-event": "ORDER_REFUNDED" }, body: "not-json" });
  expect((await POST(request())).status).toBe(401);
  state.verified = true; const response = await POST(request());
  expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ skipped: true, reason: "plugin_paused" });
  expect(state.refund).not.toHaveBeenCalled(); expect(state.store).not.toHaveBeenCalled(); expect(state.deliver).not.toHaveBeenCalled();
});
