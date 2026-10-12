export interface HomeOrder {
  id: string;
  created: string;
  status: string;
  paymentStatus: string | null;
  total: { gross: { amount: number; currency: string } };
}

/** Summarize the bounded latest-order window; never mix currencies or
 * mislabel gross values as net revenue after refunds. */
export function summarizeHomeOrders(orders: readonly HomeOrder[], now: Date) {
  const currencies = new Map<string, number>();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return { date: date.toISOString().slice(0, 10), count: 0 };
  });
  const daily = new Map(days.map(value => [value.date, value]));
  let awaitingFulfillment = 0;
  let pendingPayment = 0;
  for (const order of orders) {
    const amount = order.total?.gross?.amount;
    const currency = order.total?.gross?.currency;
    if (Number.isFinite(amount) && currency && /^[A-Z]{3}$/.test(currency)) {
      currencies.set(currency, (currencies.get(currency) ?? 0) + amount);
    }
    if (order.status === "UNFULFILLED" || order.status === "PARTIALLY_FULFILLED") {
      awaitingFulfillment++;
    }
    if (order.paymentStatus === "NOT_CHARGED" || order.paymentStatus === "PARTIALLY_CHARGED") {
      pendingPayment++;
    }
    const date = new Date(order.created);
    if (Number.isNaN(date.getTime())) continue;
    const dailyBucket = daily.get(date.toISOString().slice(0, 10));
    if (dailyBucket) dailyBucket.count++;
  }
  return {
    sampledOrders: orders.length,
    awaitingFulfillment,
    pendingPayment,
    currencies: [...currencies.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount })),
    days,
  };
}
