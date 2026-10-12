import { summarizeHomeOrders, type HomeOrder } from "./commerceHomeMetrics";

const order = (id: string, created: string, amount: number, currency: string, status = "UNFULFILLED", paymentStatus = "NOT_CHARGED"): HomeOrder => ({
  id, created, status, paymentStatus, total: { gross: { amount, currency } },
});
describe("self-hosted merchant overview (bounded recent order sample)", () => {
  it("never adds together different currencies", () => {
    const summary = summarizeHomeOrders([
      order("1", "2026-10-12T11:00:00Z", 40, "USD"),
      order("2", "2026-10-12T12:00:00Z", 25, "EUR"),
      order("3", "2026-10-10T12:00:00Z", 10, "USD", "FULFILLED", "FULLY_CHARGED"),
    ], new Date("2026-10-12T14:00:00Z"));
    expect(summary.currencies).toEqual([
      { currency: "EUR", amount: 25 },
      { currency: "USD", amount: 50 },
    ]);
    expect(summary.awaitingFulfillment).toBe(2);
    expect(summary.pendingPayment).toBe(2);
    expect(summary.days.map(x => x.count).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("does not treat all-time total count as the sample size", () => {
    const result = summarizeHomeOrders([order("a", "2026-10-12T11:00:00Z", 20, "USD")], new Date("2026-10-12T14:00:00Z"));
    expect(result.sampledOrders).toBe(1);
  });
});
