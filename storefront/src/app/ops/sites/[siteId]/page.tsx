import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { io } from "next/cache";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";
import { getBrandSites } from "@/config/brand-sites";
import { readAnalyticsSummary } from "@/plugins/analytics/first-party-store";

export const metadata: Metadata = { title: "品牌经营概况 | Commerce Ops", robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ days?: string }>;
};

function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}

/**
 * Platform-admin only (via existing /ops middleware).
 * Brand identity is resolved from server configuration, never client supplied channels.
 */
export default function BrandOverviewPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl p-8 text-sm text-stone-500">正在载入品牌数据...</main>}>
      <BrandOverviewPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function BrandOverviewPageContent({ params, searchParams }: Props) {
  await io();
  const [{ siteId }, search] = await Promise.all([params, searchParams]);
  const site = getBrandSites()?.find((item) => item.id === siteId);
  if (!site) notFound();
  const days = [7, 30, 90].includes(Number(search.days)) ? Number(search.days) : 30;
  let summary: Awaited<ReturnType<typeof readAnalyticsSummary>> = null;
  let loadFailed = false;
  if (analyticsDatabaseConfigured()) {
    try { summary = await readAnalyticsSummary(days, site.channels); }
    catch (error) { console.error("[brand-overview] scoped report failed", error); loadFailed = true; }
  }
  const sessions = summary?.sessions ?? 0;
  const orders = summary?.purchases ?? 0;
  const conversion = sessions > 0 ? (orders / sessions * 100).toFixed(2) + "%" : "—";

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 text-[#171717] md:px-10">
      <Link href="/ops/sites" className="text-sm text-stone-500 hover:text-stone-900">← 返回品牌站点</Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">BRAND OVERVIEW</p>
          <h1 className="mt-2 text-2xl font-semibold">{site.name} · 经营概况</h1>
          <p className="mt-2 text-sm text-stone-600">只统计当前品牌的 {site.channels.length} 个销售市场；不包含其他品牌数据。</p>
        </div>
        <div className="flex gap-2" aria-label="统计时间范围">
          {[7,30,90].map(period => <Link key={period} href={`/ops/sites/${encodeURIComponent(site.id)}?days=${period}`}
            aria-current={days === period ? "page" : undefined}
            className={`rounded-lg border px-3 py-2 text-sm ${days === period ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white"}`}>
            近{period}天</Link>)}
        </div>
      </div>
      <div className="mt-4">
        <Link href={`/ops/sites/${encodeURIComponent(site.id)}/insights?days=${days}`}
          className="inline-flex rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50">
          查看流量、商品及结账分析 →
        </Link>
      </div>
      <div className="mt-6 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
        <b className="text-stone-900">当前范围：</b> {site.channels.join("、")}
        <span className="ml-2 text-stone-500">第一方埋点统计，不等于 Saleor 财务结算记录。</span>
      </div>
      {!analyticsDatabaseConfigured() || loadFailed || !summary ? (
        <section className="mt-6 rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="font-semibold">暂时无法读取当前品牌的经营数据</h2>
          <p className="mt-2 text-sm text-stone-600">请检查第一方统计数据库和服务端配置。不会退回全平台汇总，以免误导经营判断。</p>
        </section>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="当前品牌经营指标">
            {[
              ["访问会话", sessions.toLocaleString("zh-CN")],
              ["成交事件", orders.toLocaleString("zh-CN")],
              ["转化率", conversion],
              ["弃单会话", summary.abandonedCheckouts.toLocaleString("zh-CN")],
            ].map(([label,value]) => (
              <article key={label} className="rounded-xl border border-stone-200 bg-white p-5">
                <p className="text-sm text-stone-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </article>
            ))}
          </section>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="font-semibold">净成交额（分币种）</h2>
              <p className="mt-1 text-xs text-stone-500">包含同品牌已采集的退款事件，不做跨币种直接相加</p>
              {summary.revenueByCurrency.length
                ? <ul className="mt-4 space-y-2">{summary.revenueByCurrency.map(row => <li key={row.currency} className="flex justify-between text-sm">
                    <span>{row.currency}</span><b className="tabular-nums">{money(row.value, row.currency)}</b>
                  </li>)}</ul>
                : <p className="mt-4 text-sm text-stone-500">该时间段没有成交数据</p>}
            </section>
            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="font-semibold">流量来源</h2>
              <p className="mt-1 text-xs text-stone-500">仅当前品牌的去重会话</p>
              {summary.sources.length
                ? <ul className="mt-4 space-y-2">{summary.sources.slice(0,8).map((source,index) => (
                    <li key={index} className="flex items-center justify-between text-sm">
                      <span>{source.source} · {source.trafficType}</span>
                      <b className="tabular-nums">{source.sessions.toLocaleString("zh-CN")}</b>
                    </li>
                  ))}</ul>
                : <p className="mt-4 text-sm text-stone-500">暂无来源记录</p>}
            </section>
          </div>
          <section className="mt-4 rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold">最近事件</h2>
            <div className="mt-4 space-y-2">
              {summary.recent.length ? summary.recent.slice(0,12).map((event,index) => (
                <div key={index} className="flex flex-wrap justify-between gap-2 border-b border-stone-100 pb-2 text-sm">
                  <span>{event.name} <span className="text-stone-500">· {event.channel}</span></span>
                  <time className="text-stone-500">{event.occurredAt}</time>
                </div>
              )) : <p className="text-sm text-stone-500">暂无事件</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
