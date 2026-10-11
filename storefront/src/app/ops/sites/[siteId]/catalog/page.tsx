import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { getBrandSites } from "@/config/brand-sites";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { readCatalogAudit } from "@/lib/ops/catalog-audit";
import { CatalogCsvValidator } from "./csv-validator";
type Props = { params: Promise<{ siteId: string }>; searchParams: Promise<{ channel?: string; after?: string }> };
export default function CatalogPage(props: Props) { return <Suspense fallback={<p className="p-8" role="status">正在核对商品发布资料…</p>}><CatalogContent {...props} /></Suspense>; }
async function CatalogContent({ params, searchParams }: Props) {
  await io(); const [{ siteId }, query, viewer] = await Promise.all([params, searchParams, currentOpsViewer()]);
  const site = getBrandSites()?.find(site => site.id === siteId);
  if (!site || !viewer || (viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) return <p className="p-8" role="alert">品牌不存在或没有权限。</p>;
  let audit;
  try { audit = await readCatalogAudit(siteId, viewer, query.channel, query.after); } catch { /* Render configuration/permission outage explicitly below. */ }
  const dashboard = (process.env.SALEOR_DASHBOARD_URL ?? "").replace(/\/$/, "");
  return <main className="mx-auto max-w-7xl space-y-5 px-5 py-8">
    <Link href={`/ops/sites/${encodeURIComponent(siteId)}`} className="text-sm underline">← 品牌经营概况</Link>
    <header><h1 className="text-2xl font-semibold">{site.name} · 商品发布检查</h1><p className="mt-2 text-sm text-muted-foreground">商品事实可能在共享Core中供多个品牌复用；此页只展示本品牌市场，编辑共享商品时仍需确认影响范围。</p></header>
    <form method="get" className="flex items-center gap-3"><label className="text-sm">库存检查市场 <select aria-label="库存检查市场" name="channel" defaultValue={audit?.channel ?? site.defaultChannel} className="ml-2 rounded-lg border border-border bg-background p-2">{site.channels.map(channel => <option key={channel}>{channel}</option>)}</select></label><button className="rounded-lg border border-border px-3 py-2 text-sm">重新检查</button></form>
    <section className="rounded-xl border border-border bg-card p-5 text-sm"><h2 className="font-semibold">发布清单</h2><p className="mt-2 text-muted-foreground">主图、真实品牌、规格SKU、重量、库存策略、各市场价格/发布状态、描述与SEO。配送区域、翻译和政策仍需实际验收；商品数据没有问题也不等于可正式上线。</p><Link href={`/ops/sites/${encodeURIComponent(siteId)}/readiness`} className="mt-3 inline-block underline">打开品牌上线验收 →</Link></section>
    {!audit ? <p role="alert" className="rounded-xl border border-border p-5">无法读取当前市场完整商品资料，请检查选择及商品读取凭证/权限。需要具备 MANAGE_PRODUCTS 的服务器凭证；不会改用全品牌商品列表。</p> : <>
      <p className="text-xs text-muted-foreground">本页最多25个商品，每个最多50个规格；可售量只针对 {audit.channel} 的默认配送上下文，不代表所有国家/仓库库存。检查时间：{audit.checkedAt}</p>
      {audit.products.map(product => <article key={product.id} className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{product.name}</h2><p className="mt-1 text-xs text-muted-foreground">品牌：{product.brand || "未填写"} · {product.slug}</p></div>{viewer.role === "platform_admin" && dashboard && <a href={`${dashboard}/products/${encodeURIComponent(product.id)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm">在原生后台编辑 ↗</a>}</div>
        {product.issues.length ? <ul className="mt-4 space-y-1 text-sm">{product.issues.map((issue,index) => <li key={`${issue.code}:${index}`}><b>{issue.severity === "blocker" ? "阻断" : "待核对"}</b> · {issue.label}</li>)}</ul> : <p className="mt-4 text-sm">当前已读取资料未发现检查问题；配送/翻译/政策另行验收。</p>}
        <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">市场价格、发布状态与规格库存</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr>{["市场", "发布", "列表展示", "开放购买", "规格价格"].map(label => <th className="border-b border-border p-2" key={label}>{label}</th>)}</tr></thead><tbody>{product.markets.map(market => <tr key={market.channel}><td className="p-2">{market.channel}</td><td className="p-2">{market.missing ? "未分配" : market.published ? "已发布" : "未发布"}</td><td className="p-2">{market.visible ? "是" : "否"}</td><td className="p-2">{market.purchasable ? "是" : "否"}</td><td className="p-2">{market.prices.map((price,index) => <p key={index}>{price.sku || "缺SKU"}：{price.amount ?? "未定价"} {price.currency}</p>)}</td></tr>)}</tbody></table></div><ul className="mt-3 space-y-1 text-xs">{product.inventory.map((stock,index) => <li key={index}>{stock.sku || "缺SKU"} · {stock.tracked ? `跟踪库存，可售 ${stock.available ?? "未知"}` : "不跟踪库存"}</li>)}</ul></details>
      </article>)}
      {!audit.products.length && <p className="text-sm">当前市场没有已分配商品，请在原生后台分配商品。</p>}
      {audit.nextCursor && <Link href={`?channel=${encodeURIComponent(audit.channel)}&after=${encodeURIComponent(audit.nextCursor)}`} className="inline-block rounded-lg border border-border px-4 py-2 text-sm">下一页商品 →</Link>}
    </>}
    {viewer.role === "platform_admin" && <CatalogCsvValidator siteId={siteId} />}
  </main>;
}
