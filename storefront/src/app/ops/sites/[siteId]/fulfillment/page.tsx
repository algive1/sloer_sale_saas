import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { fulfillmentScope, readFulfillmentSnapshot, shippingExportHistory } from "@/lib/ops/fulfillment";
import { ShippingExport } from "./shipping-export";
type Props = { params: Promise<{ siteId: string }>; searchParams: Promise<{ channel?: string; after?: string }> };
export default function FulfillmentPage(props: Props) { return <Suspense fallback={<p className="p-8" role="status">正在核对品牌发货订单…</p>}><FulfillmentContent {...props} /></Suspense>; }
async function FulfillmentContent({ params, searchParams }: Props) {
  await io(); const [{ siteId }, query, viewer] = await Promise.all([params, searchParams, currentOpsViewer()]);
  let scope;
  try { scope = fulfillmentScope(siteId, viewer, query.channel); } catch { return <p className="p-8" role="alert">品牌或市场不存在，或没有权限。</p>; }
  const { site, channel } = scope;
  const individualAdmin = viewer?.role === "platform_admin" && viewer.username !== "analytics";
  const dashboard = individualAdmin ? (process.env.SALEOR_DASHBOARD_URL ?? "").replace(/\/$/, "") || null : null;
  let snapshot; let history;
  try { snapshot = await readFulfillmentSnapshot(siteId, viewer, channel, query.after); } catch { /* Explicit outage */ }
  if (individualAdmin) { try { history = await shippingExportHistory(siteId, viewer, channel); } catch { /* Explicit audit outage */ } }
  return <main className="mx-auto max-w-6xl space-y-5 px-5 py-8">
    <Link href={`/ops/sites/${encodeURIComponent(siteId)}`} className="text-sm underline">← 品牌经营概况</Link>
    <header><h1 className="text-2xl font-semibold">{site.name} · 发货与货代交接</h1><p className="mt-2 text-sm text-muted-foreground">原生 Saleor 是付款、库存与发货事实来源。此页按品牌市场处理队列，发货、退款和物流通知继续使用原生后台。</p></header>
    <form method="get" className="flex flex-wrap items-center gap-3"><label className="text-sm">发货市场 <select aria-label="发货市场" name="channel" defaultValue={channel} className="ml-2 rounded-lg border border-border bg-background p-2">{site.channels.map(item => <option key={item}>{item}</option>)}</select></label><button className="rounded-lg border border-border px-3 py-2 text-sm">重新读取</button></form>
    {individualAdmin && <Link href={`/ops/sites/${encodeURIComponent(siteId)}/tracking?channel=${encodeURIComponent(channel)}`} className="inline-block rounded-lg border border-border px-4 py-2 text-sm">回填货代物流单号 →</Link>}
    {!snapshot ? <p role="alert" className="rounded-xl border border-border p-5">无法读取当前市场发货队列。请检查市场与具备 MANAGE_ORDERS 的服务器凭证，不会回退全品牌订单。</p> : <>
      <p className="text-xs text-muted-foreground">读取时间：{snapshot.checkedAt}。每页25笔，包含尚未付清订单；当前页数量不代表全部积压订单。列表不展示收件资料。</p>
      {individualAdmin && !dashboard && <p className="text-sm" role="alert">请配置原生后台地址 SALEOR_DASHBOARD_URL，以启用发货入口与货代交接操作。</p>}
      <ShippingExport key={`${channel}:${query.after ?? ""}`} snapshot={snapshot} dashboard={dashboard} />
      {snapshot.nextCursor && <Link href={`?channel=${encodeURIComponent(channel)}&after=${encodeURIComponent(snapshot.nextCursor)}`} className="inline-block rounded-lg border border-border px-4 py-2 text-sm">下一页订单 →</Link>}
    </>}
    {individualAdmin && <section className="rounded-xl border border-border bg-card p-5 text-sm"><h2 className="font-semibold">最近准备导出记录 · {channel}</h2><p className="mt-2 text-xs text-muted-foreground">只记录个人管理员、时间和数量，不保存收件地址或CSV。准备成功不代表下载、货代接收或发货成功。</p>{history == null ? <p className="mt-3">审计存储未配置或不可用；导出时必须成功写入审计记录。</p> : history.length ? <ul className="mt-3 space-y-2">{history.map(row => <li key={row.id}>{row.preparedAt} · {row.actor} · {row.orderCount}笔 / {row.rowCount}行 <span className="text-xs text-muted-foreground">{row.id}</span></li>)}</ul> : <p className="mt-3">暂无导出记录。</p>}</section>}
    <Link href={`/ops/sites/${encodeURIComponent(siteId)}/readiness`} className="inline-block text-sm underline">配送与顾客查单上线验收 →</Link>
  </main>;
}
