import "server-only";
import { getBrandSites } from "@/config/brand-sites";
import { fetchSaleorOrdersPage, type OpsOrder } from "@/lib/analytics/saleor-ops-orders";
import type { OpsViewer } from "./authorization";

// This read model deliberately excludes email/customer addresses and mutations.
export type BrandOrder = Pick<OpsOrder, "id" | "channel" | "number" | "createdAt" | "status" | "paymentStatus" | "isPaid" | "hasRefund" | "amount" | "currency" | "productName">;
export async function readBrandRecentOrders(siteId: string, viewer: OpsViewer | null, limit = 10): Promise<BrandOrder[]> {
  if (!viewer || (viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) throw new Error("forbidden_brand_orders");
  const site = getBrandSites()?.find(site => site.id === siteId);
  if (!site) throw new Error("unknown_brand_orders");
  const count = Number.isInteger(limit) ? Math.max(1, Math.min(25, limit)) : 10;
  const results: OpsOrder[] = [];
  // Bound simultaneous upstream requests. A failed/foreign page fails the
  // complete read; never present a partial market list as brand-wide results.
  for (let i = 0; i < site.channels.length; i += 4) {
    const pages = await Promise.all(site.channels.slice(i, i + 4).map(async channel => {
      const page = await fetchSaleorOrdersPage(count, undefined, channel);
      if (!page || page.orders.some(order => order.channel !== channel)) throw new Error("brand_order_source_unavailable");
      return page.orders;
    }));
    results.push(...pages.flat());
  }
  return [...new Map(results.map(order => [order.id, order])).values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, count)
    .map(({ id, channel, number, createdAt, status, paymentStatus, isPaid, hasRefund, amount, currency, productName }) => ({ id, channel, number, createdAt, status, paymentStatus, isPaid, hasRefund, amount, currency, productName }));
}
