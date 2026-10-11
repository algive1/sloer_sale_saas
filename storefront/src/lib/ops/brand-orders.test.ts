import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/saleor-ops-orders", () => ({ fetchSaleorOrdersPage: vi.fn() }));
import { fetchSaleorOrdersPage, type OpsOrder } from "@/lib/analytics/saleor-ops-orders";
import { readBrandRecentOrders } from "./brand-orders";
const viewer = { username: "reader", role: "brand_analyst" as const, siteIds: ["fashion"] };
const order = (id: string, channel: string, createdAt: string): OpsOrder => ({ id, channel, createdAt, number: id, productName: "Hat", country: "US", source: "direct", paidAt: null, status: "UNFULFILLED", paymentStatus: "NOT_CHARGED", authorizeStatus: "NONE", isPaid: false, hasRefund: false, amount: 10, currency: "USD", paymentMethod: "—", thumbnailUrl: "", email: "private@example.test" });
beforeEach(() => {
  vi.mocked(fetchSaleorOrdersPage).mockReset();
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([
    { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us", "fashion-eu"], defaultChannel: "fashion-us" },
    { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
  ]));
});
afterEach(() => vi.unstubAllEnvs());
it("checks viewer and site before any order request", async () => {
  await expect(readBrandRecentOrders("jewelry", viewer)).rejects.toThrow("forbidden");
  await expect(readBrandRecentOrders("fashion", null)).rejects.toThrow("forbidden");
  await expect(readBrandRecentOrders("unknown", { ...viewer, role: "platform_admin" })).rejects.toThrow("unknown");
  expect(fetchSaleorOrdersPage).not.toHaveBeenCalled();
});
it("queries each authorized channel, merges most recent rows and omits customer identity", async () => {
  vi.mocked(fetchSaleorOrdersPage).mockImplementation(async (_limit, _cursor, channel) => ({ orders: [order(channel === "fashion-us" ? "old" : "new", channel!, channel === "fashion-us" ? "2026-10-01" : "2026-10-02")], hasNextPage: false, endCursor: null }));
  const rows = await readBrandRecentOrders("fashion", viewer, 1); expect(rows.map(row => row.id)).toEqual(["new"]);
  expect(fetchSaleorOrdersPage).toHaveBeenCalledWith(1, undefined, "fashion-us"); expect(fetchSaleorOrdersPage).toHaveBeenCalledWith(1, undefined, "fashion-eu");
  expect(JSON.stringify(rows)).not.toMatch(/email|private@example|country|paymentMethod/);
});
it("fails the complete list when one market is unavailable or returns a foreign order", async () => {
  vi.mocked(fetchSaleorOrdersPage).mockResolvedValue({ orders: [order("foreign", "jewelry-us", "2026-10-02")], hasNextPage: false, endCursor: null });
  await expect(readBrandRecentOrders("fashion", viewer)).rejects.toThrow("unavailable");
  vi.mocked(fetchSaleorOrdersPage).mockResolvedValue(null); await expect(readBrandRecentOrders("fashion", viewer)).rejects.toThrow("unavailable");
});
