import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/libsql-http", () => ({
  analyticsDatabaseConfigured: () => false,
  hranaRowsToObjects: () => [],
  libsqlPipeline: vi.fn(),
}));

import { fetchSaleorOrder, fetchSaleorOrders } from "./saleor-ops-orders";

const order = {
  id: "T3JkZXI6MQ==",
  number: "512",
  created: "2026-10-08T00:00:00Z",
  status: "UNFULFILLED",
  isPaid: true,
  paymentStatus: "FULLY_CHARGED",
  authorizeStatus: "NONE",
  userEmail: "customer@example.com",
  shippingAddress: { country: { code: "DE" } },
  total: { gross: { amount: 42.50, currency: "EUR" } },
  totalRefunded: { amount: 0 },
  lines: [{ productName: "Hat", thumbnail: { url: "https://example.com/hat.webp" } }],
  payments: [],
  transactions: [{ name: "Stripe", events: [
    { type: "CHARGE_SUCCESS", createdAt: "2026-10-08T00:02:00Z" },
  ] }],
};

describe("Saleor order operations", () => {
  beforeEach(() => {
    vi.stubEnv("SALEOR_APP_TOKEN", "ops-test-token");
    vi.stubEnv("SALEOR_INTERNAL_API_URL", "http://api:8000/graphql/");
    vi.stubEnv("NEXT_PUBLIC_SALEOR_API_URL", "https://shop.example.com/graphql/");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("queries the exact order, including orders outside the recent list", async () => {
    const mockedFetch = vi.fn(async () => new Response(JSON.stringify({
      data: { order },
    }), { status: 200 }));
    vi.stubGlobal("fetch", mockedFetch);
    const result = await fetchSaleorOrder(order.id);
    expect(result?.number).toBe("512");
    expect(result?.paidAt).toBe("2026-10-08T00:02:00Z");
    expect(result?.country).toBe("DE");
    expect(result?.paymentMethod).toBe("Stripe");
    const [url, options] = mockedFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api:8000/graphql/");
    const payload = JSON.parse(String(options.body));
    expect(payload.variables.id).toBe(order.id);
    expect(payload.query).toContain("order(id:$id)");
  });

  it("uses no guessed paidAt timestamp when Saleor has no charge event", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: { orders: { edges: [{ node: { ...order, transactions: [] } }] } },
    }), { status: 200 })));
    const orders = await fetchSaleorOrders(25);
    expect(orders?.[0]?.paidAt).toBeNull();
  });

  it("rejects GraphQL errors rather than inventing an unpaid order", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      errors: [{ message: "Unauthorized" }],
    }), { status: 200 })));
    await expect(fetchSaleorOrder(order.id)).rejects.toThrow("Unauthorized");
  });
});
