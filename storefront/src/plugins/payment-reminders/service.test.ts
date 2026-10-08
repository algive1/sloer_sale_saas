import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/saleor-ops-orders", () => ({
  fetchSaleorOrder: vi.fn(),
  fetchSaleorOrdersPage: vi.fn(),
}));
vi.mock("@/lib/storage/libsql-http", () => ({
  analyticsDatabaseConfigured: () => false,
  libsqlPipeline: vi.fn(),
  hranaRowsToObjects: () => [],
}));

import { fetchSaleorOrder } from "@/lib/analytics/saleor-ops-orders";
import { sendManualReminder, sendReminder } from "./service";
import type { OpsOrder } from "@/lib/analytics/saleor-ops-orders";

const pending: OpsOrder = {
  id: "T3JkZXI6MQ==",
  number: "512",
  createdAt: "2026-10-08T00:00:00Z",
  paidAt: null,
  country: "DE",
  source: "organic",
  status: "UNFULFILLED",
  paymentStatus: "NOT_CHARGED",
  authorizeStatus: "NONE",
  isPaid: false,
  hasRefund: false,
  amount: 40,
  currency: "EUR",
  paymentMethod: "—",
  thumbnailUrl: "",
  productName: "Hat",
  email: "customer@example.com",
};

describe("reminder revalidation", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "dummy-api-key");
    vi.stubEnv("PAYMENT_REMINDER_FROM", "Orders <orders@example.com>");
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://shop.example.com");
    vi.mocked(fetchSaleorOrder).mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never sends if the order was paid since the dashboard rendered", async () => {
    vi.mocked(fetchSaleorOrder).mockResolvedValue({ ...pending, isPaid: true, paymentStatus: "FULLY_CHARGED" });
    const emailFetch = vi.fn();
    vi.stubGlobal("fetch", emailFetch);
    expect(await sendReminder(pending, "manual")).toEqual({ status: "skipped", reason: "already_paid" });
    expect(emailFetch).not.toHaveBeenCalled();
  });

  it("never sends when an old order ID is no longer available", async () => {
    vi.mocked(fetchSaleorOrder).mockResolvedValue(null);
    const emailFetch = vi.fn();
    vi.stubGlobal("fetch", emailFetch);
    expect(await sendManualReminder(pending.id)).toEqual({
      status: "skipped", reason: "order_not_found_or_saleor_unavailable",
    });
    expect(emailFetch).not.toHaveBeenCalled();
  });

  it("uses one authoritative Saleor lookup for a manual reminder request", async () => {
    vi.mocked(fetchSaleorOrder).mockResolvedValue({ ...pending, isPaid: true, paymentStatus: "FULLY_CHARGED" });
    const emailFetch = vi.fn();
    vi.stubGlobal("fetch", emailFetch);
    expect(await sendManualReminder(pending.id)).toEqual({status:"skipped",reason:"already_paid"});
    expect(fetchSaleorOrder).toHaveBeenCalledTimes(1);
    expect(emailFetch).not.toHaveBeenCalled();
  });

  it("does not proceed if the fresh Saleor status request fails", async () => {
    vi.mocked(fetchSaleorOrder).mockRejectedValue(new Error("Saleor is unavailable"));
    const emailFetch = vi.fn();
    vi.stubGlobal("fetch", emailFetch);
    await expect(sendReminder(pending, "manual")).rejects.toThrow("Saleor is unavailable");
    expect(emailFetch).not.toHaveBeenCalled();
  });
});
