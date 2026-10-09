import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { io } from "next/cache";
import { getBrandSites } from "@/config/brand-sites";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";
import { readTrafficReport } from "@/plugins/analytics/traffic-report";
import { readProductReport } from "@/plugins/analytics/product-report";
import { readCheckoutReport } from "@/plugins/analytics/checkout-report";

export const metadata: Metadata = {
  title: "品牌经营分析 | Commerce Ops",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ days?: string }>;
};

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

export default async function BrandInsightsPage({ params, searchParams }: Props) {
  await io();
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  // The siteId is a lookup only. SQL predicates come exclusively from this
  // trusted configuration, never querystring-provided Channel IDs.
  const site = getBrandSites()?.find((entry) => entry.id === siteId);
  if (!site) notFound();
  const requested = Number(query.days);
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  const now = new Date();
  const range = {
    from: new Date(now.getTime() - days * 86_400_000),
    to: now,
    bucket: "day" as const,
    channels: site.channels,
  };

  const href = (period: number) =>
    `/ops/sites/${encodeURIComponent(site.id)}/insights?days=${period}`;

  let data: Awaited<ReturnType<typeof loadInsights>> | null = null;
  let failed = false;
  if (analyticsDatabaseConfigured()) {
    try { data = await loadInsights(range); }
    catch (error) {
      failed = true;
      console.error("[brand-insights] Failed to query channel-scoped reports", error);
    }
  }

  const reports = data;

  return <main className="mx-auto max-w-7xl px-4 py-8 text-[#171717] md:px-10">
    <div className="flex flex-wrap gap-4 text-sm">
      <Link href={`/ops/sites/${encodeURIComponent(site.id)}`} className="text-stone-500 hover:text-stone-950">
        ← 返回品牌经营概况
      </Link>
      <Link href="/ops/sites" className="text-stone-500 hover:text-stone-950">所有品牌</Link>
    </div>
    <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">BRAND INSIGHTS</p>
        <h1 className="mt-2 text-2xl font-semibold">{site.name} · 详细经营分析</h1>
        <p className="mt-2 text-sm text-stone-500">仅包含 {site.channels.join("、")}，不包含其他品牌。数据来自第一方已采集事件。</p>
      </div>
      <nav className="flex gap-2" aria-label="统计时间">
        {[7, 30, 90].map(period => <Link key={period} href={href(period)}
          aria-current={days === period ? "page" : undefined}
          className={`rounded-lg border px-3 py-2 text-sm ${days === period
            ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white"}`}>
          近{period}天
        </Link>)}
      </nav>
    </header>

    {!reports ? <section className="mt-7 rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="font-semibold">无法读取当前品牌的详细数据</h2>
      <p className="mt-2 text-sm text-stone-600">{failed
        ? "数据查询出现错误，请检查服务器和统计数据库日志。"
        : "请先配置第一方统计数据库。"}不会自动展示全品牌数据代替。</p>
    </section> : <>
      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="品牌经营分析核心指标">
        {[
          ["访问会话", formatCount(reports.traffic.sessions)],
          ["商品浏览会话", formatCount(reports.traffic.quality.productViews)],
          ["加购会话", formatCount(reports.traffic.quality.addToCarts)],
          ["完成付款订单", formatCount(reports.checkout.summary.orders)],
        ].map(([label, value]) => <article key={label}
          className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-sm text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        </article>)}
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="font-semibold">流量构成</h2>
          <p className="mt-1 text-xs text-stone-500">自然、付费与直接访问按会话去重</p>
          <div className="mt-4 space-y-3">
            {reports.traffic.byType.map(row => <div key={row.trafficType} className="grid grid-cols-[80px_1fr_60px] items-center gap-3 text-sm">
              <span>{row.trafficType}</span>
              <div className="h-2 overflow-hidden rounded bg-stone-100">
                <div className="h-full rounded bg-stone-600" style={{
                  width: `${reports.traffic.sessions ? (row.sessions / reports.traffic.sessions * 100) : 0}%`,
                }}/>
              </div>
              <b className="text-right tabular-nums">{formatCount(row.sessions)}</b>
            </div>)}
            {!reports.traffic.byType.length && <p className="text-sm text-stone-500">暂无流量数据</p>}
          </div>
          <h3 className="mt-6 text-sm font-semibold">来源 TOP 5</h3>
          <div className="mt-3 space-y-2">
            {reports.traffic.sources.slice(0,5).map((item,index) => <p key={index} className="flex justify-between gap-4 text-sm">
              <span className="truncate">{item.source} · {item.trafficType}</span>
              <span className="shrink-0 font-medium tabular-nums">{formatCount(item.sessions)}</span>
            </p>)}
          </div>
        </article>
        <article className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="font-semibold">结账健康度</h2>
          <p className="mt-1 text-xs text-stone-500">仅当前品牌。失败事件可能不等于失败订单数量。</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["开始结账", reports.checkout.summary.started],
              ["成功购买会话", reports.checkout.summary.purchaseSessions],
              ["支付失败事件", reports.checkout.summary.paymentFailures],
              ["结账失败事件", reports.checkout.summary.checkoutFailures],
            ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-stone-100 p-3">
              <p className="text-xs text-stone-500">{label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{formatCount(Number(value))}</p>
            </div>)}
          </div>
          <h3 className="mt-5 text-sm font-semibold">结账漏斗</h3>
          <div className="mt-3 space-y-2">
            {reports.checkout.funnel.map(stage => <div key={stage.key} className="flex justify-between gap-3 text-sm">
              <span>{stage.label}</span><b className="tabular-nums">{formatCount(stage.count)}</b>
            </div>)}
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="font-semibold">商品表现</h2>
        <p className="mt-1 text-xs text-stone-500">仅当前品牌的商品浏览、加购和购买数据</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-500">
              <tr><th className="pb-3 pr-3 font-medium">商品</th>
                <th className="pb-3 text-right font-medium">浏览会话</th>
                <th className="pb-3 text-right font-medium">加购会话</th>
                <th className="pb-3 text-right font-medium">购买会话</th>
                <th className="pb-3 text-right font-medium">售出件数</th></tr>
            </thead>
            <tbody>
              {reports.products.products.slice(0,12).map(product => <tr key={product.itemKey} className="border-b border-stone-100">
                <td className="max-w-[300px] py-3 pr-3">
                  <span className="block truncate font-medium">{product.itemName || product.itemKey}</span>
                  {product.sku && <span className="block truncate text-xs text-stone-500">SKU: {product.sku}</span>}
                </td>
                <td className="py-3 text-right tabular-nums">{formatCount(product.productViews)}</td>
                <td className="py-3 text-right tabular-nums">{formatCount(product.addToCarts)}</td>
                <td className="py-3 text-right tabular-nums">{formatCount(product.purchaseSessions)}</td>
                <td className="py-3 text-right tabular-nums">{formatCount(product.unitsSold)}</td>
              </tr>)}
              {!reports.products.products.length && <tr><td colSpan={5} className="py-5 text-center text-stone-500">暂无商品数据</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>}
  </main>;
}

async function loadInsights(range: {
  from: Date;
  to: Date;
  bucket: "day";
  channels: readonly string[];
}) {
  const [traffic, products, checkout] = await Promise.all([
    readTrafficReport(range),
    readProductReport(range),
    readCheckoutReport(range),
  ]);
  return { traffic, products, checkout };
}
