"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FulfillmentSnapshot } from "@/lib/ops/fulfillment";
export function ShippingExport({ snapshot, dashboard }: { snapshot: FulfillmentSnapshot; dashboard: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/ops/sites/${encodeURIComponent(snapshot.siteId)}/fulfillment/api`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "shipping-export" }, body: JSON.stringify({ channel: snapshot.channel, orderIds: selected, confirm: confirmed }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setMessage(body?.error === "export_sku_incomplete" ? "剩余实物商品缺SKU，未生成交接文件。请先核对原生订单与商品资料。" : response.status === 409 ? "订单付款、数量或地址发生变化，或资料不完整。请刷新核对后重新选择。" : response.status === 403 ? "请使用个人管理员账户操作。" : "导出失败，请检查订单读取凭证及审计存储。没有生成可下载文件。"); return;
      }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${snapshot.siteId}-${snapshot.channel}-shipping.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`已准备 ${response.headers.get("X-Shipping-Export-Rows")} 行交接资料；记录号 ${response.headers.get("X-Shipping-Export-Id")}。请确认文件下载成功，核对后交给货代；导出没有创建发货或扣减库存。`);
      setSelected([]); setConfirmed(false); router.refresh();
    } catch { setMessage("网络中断，请检查下载记录和文件；确认后再决定是否重新导出。"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">待处理订单（当前页 {snapshot.orders.length} 笔）</h2><button disabled={busy} onClick={() => { setSelected([]); setConfirmed(false); router.refresh(); }} className="rounded-lg border border-border px-3 py-2 text-sm">刷新订单</button></div>
    {!snapshot.orders.length && <p className="text-sm text-muted-foreground">当前市场没有未发货或部分发货订单。</p>}
    {snapshot.orders.map(order => <article key={order.id} className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3">{dashboard && <input aria-label={`选择订单 ${order.number}`} type="checkbox" disabled={!order.exportable || busy} checked={selected.includes(order.id)} onChange={event => setSelected(current => event.target.checked ? [...current,order.id] : current.filter(id => id !== order.id))} />}<h3 className="font-semibold">#{order.number}</h3><span className="text-xs">{order.isPaid ? "已付款" : "尚未付清"} · {order.status === "PARTIALLY_FULFILLED" ? "部分发货" : "未发货"}</span></div>
        {dashboard && <div className="flex gap-3 text-sm"><a href={`${dashboard}/orders/${encodeURIComponent(order.id)}`} target="_blank" rel="noopener noreferrer" className="underline">原生订单 ↗</a>{order.shippingReady && <a href={`${dashboard}/orders/${encodeURIComponent(order.id)}/fulfill`} target="_blank" rel="noopener noreferrer" className="underline">原生发货 ↗</a>}</div>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{order.channel} · {order.created}</p>
      <ul className="mt-3 space-y-1 text-sm">{order.lines.map(line => <li key={line.id}>{line.productSku || "缺SKU"} · {line.productName} · 已发 {line.quantityFulfilled} / {line.quantity}，剩余 {line.quantityToFulfill}{!line.isShippingRequired && "（无需物流）"}</li>)}</ul>
      {!!order.fulfillments?.length && <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{order.fulfillments.map(item => <li key={item.id}>发货记录 {item.status} · 单号 {item.trackingNumber || "未填写"}</li>)}</ul>}
      {!order.shippingReady && <p className="mt-2 text-xs text-muted-foreground">未付清、缺配送地址或无需配送的订单不提供交接导出。</p>}
      {order.shippingReady && !order.exportable && <p className="mt-2 text-xs text-muted-foreground">剩余实物商品缺SKU，暂不可导出交接资料；请在原生订单中核对并补齐商品资料。</p>}
    </article>)}
    {dashboard && <div className="rounded-xl border border-border p-5 text-sm"><h2 className="font-semibold">交给货代</h2><p className="mt-2 text-muted-foreground">CSV包含收件姓名、电话和地址，只用于当前品牌的履约交接。每次最多25笔订单/500行，导出前会重新读取付款、剩余数量和地址；整单重量不等于本次包裹重量。请在原生后台确认库存、仓库和部分发货数量，并回填物流单号。</p>
      <label className="mt-4 flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />我已核对选择，将收件资料仅用于货代履约交接。</label>
      <button disabled={busy || !confirmed || !selected.length} onClick={download} className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy ? "正在核对并导出…" : `导出交接CSV（${selected.length}笔）`}</button>
      <p className="mt-3 text-xs text-muted-foreground">每次准备导出都会留记录；文件下载、货代接收和实际发货需另行确认。</p>
    </div>}
    {message && <p role="status" className="rounded-lg border border-border p-4 text-sm">{message}</p>}
  </section>;
}
