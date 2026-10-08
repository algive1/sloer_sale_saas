"use client";
import {useEffect,useState} from "react";
import {SaleorImage} from "@/ui/atoms/saleor-image";
import type {RealtimeAnalytics} from "@/lib/analytics/realtime-report";
import {RealtimeTrendChart} from "./realtime-trend-chart";

const REFRESH_MS=10000;
const labels:Record<string,string>={
 page_viewed:"浏览页面",product_viewed:"浏览商品",product_added_to_cart:"加入购物车",
 cart_viewed:"查看购物车",checkout_started:"开始结账",checkout_completed:"购买完成",
 payment_method_selected:"选择支付",payment_failed:"支付失败",checkout_failed:"结账失败",
 wishlist_added:"加入收藏",shipping_method_selected:"选择配送",refund_completed:"订单退款",
};
const formatTime=(v:string)=>v?new Date(v).toLocaleTimeString("zh-CN",{hour12:false}):"—";
const formatMoney=(n:number,c:string)=>{try{return new Intl.NumberFormat("en",{style:"currency",currency:c}).format(n);}catch{return n.toFixed(2)+" "+c;}};
type EventRow=RealtimeAnalytics["recentEvents"][number];
export function RealtimeDashboard({initialData}:{initialData:RealtimeAnalytics}){
 const [data,setData]=useState(initialData);
 const [paused,setPaused]=useState(false);
 const [error,setError]=useState("");
 const [detail,setDetail]=useState<EventRow|null>(null);
 useEffect(()=>{
  if(paused)return;
  let active=true;
  const controller=new AbortController();
  const refresh=async()=>{
   try{
    const r=await fetch("/ops/api/analytics/realtime",{cache:"no-store",credentials:"same-origin",signal:controller.signal});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const next=await r.json() as RealtimeAnalytics;
    if(active){setData(next);setError("");}
   }catch(e){if(active&&!controller.signal.aborted)setError(e instanceof Error?e.message:"数据更新失败");}
  };
  const timer=setInterval(()=>void refresh(),REFRESH_MS);
  return ()=>{active=false;controller.abort();clearInterval(timer);};
 },[paused]);
 const maxSource=Math.max(1,...data.sources.map(x=>x.sessions));
 const maxCountry=Math.max(1,...data.countries.map(x=>x.sessions));
 const summary=[
  ["当前活跃",data.summary.activeSessions,"过去5分钟活跃会话"],
  ["近5分钟事件",data.summary.events,"站内记录事件"],
  ["近5分钟加购",data.summary.addToCartSessions,"独立加购会话"],
  ["近5分钟订单",data.summary.orders,"购买完成事件"],
  ["支付失败",data.summary.paymentFailures,"近5分钟支付失败"],
 ] as const;
 return <main className="mx-auto max-w-[1560px] px-4 py-8 lg:px-8">
  <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
   <div><p className="text-xs font-semibold tracking-wide text-muted-foreground">OPERATIONS / LIVE</p><h1 className="mt-1 text-2xl font-bold"><span className={"mr-2 inline-block h-2.5 w-2.5 rounded-full "+(paused?"bg-gray-400":"bg-emerald-500")}/>实时数据</h1>
    <p className="mt-1 text-xs text-muted-foreground">在线表示最近 5 分钟产生过事件的会话，不代表持续 WebSocket 连接。</p></div>
   <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{paused?"已暂停":"每10秒更新"} · {formatTime(data.generatedAt)}</span>
    <button type="button" onClick={()=>setPaused(x=>!x)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">{paused?"继续":"暂停"}</button></div>
  </header>
  {error&&<p role="status" className="mb-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">更新失败：{error}，仍显示上次有效数据。</p>}
  <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
   {summary.map(([name,value,note])=><div className="rounded-xl border border-border bg-card p-4" key={name}><p className="text-xs text-muted-foreground">{name}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p><p className="mt-1 text-[11px] text-muted-foreground">{note}</p></div>)}
  </section>
  <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.15fr_.85fr]">
   <section className="min-w-0 rounded-xl border border-border bg-card p-4">
    <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">实时行为流</h2><span className="text-xs text-emerald-600">{paused?"已暂停":"● Live"}</span></div>
    <p className="mb-3 text-xs text-muted-foreground">最新事件置顶 · 点击任意记录查看完整内容</p>
    <div className="divide-y divide-border/60">
     {data.recentEvents.slice(0,12).map((event,i)=><button key={event.occurredAt+event.name+i} type="button" onClick={()=>setDetail(event)} className="grid w-full grid-cols-[62px_92px_minmax(0,1fr)_72px] items-center gap-2 py-3 text-left text-xs hover:bg-secondary/50">
      <span className="tabular-nums text-muted-foreground">{formatTime(event.occurredAt)}</span><span className="font-semibold">{labels[event.name]??event.name}</span>
      <span className="min-w-0 truncate text-muted-foreground">{event.countryCode} · {event.source} · {event.itemName||event.method||"—"}</span>
      <span className="text-right tabular-nums font-medium">{event.currency?formatMoney(event.value,event.currency):"—"}</span>
     </button>)}
     {!data.recentEvents.length&&<p className="py-8 text-center text-sm text-muted-foreground">过去5分钟没有事件</p>}
    </div>
   </section>
   <div className="space-y-4">
    <section className="min-w-0 rounded-xl border border-border bg-card p-4">
     <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">在线用户趋势</h2><span className="text-xs text-muted-foreground">近30分钟</span></div>
     <RealtimeTrendChart points={data.trend}/>
     <div className="mt-2 grid grid-cols-3 gap-2">{[["活动会话",data.summary.activeSessions],["加购",data.summary.addToCartSessions],["结账",data.summary.checkoutSessions]].map(([name,value])=><div className="rounded-lg border border-border p-2" key={String(name)}><p className="text-[10px] text-muted-foreground">{name}</p><b className="mt-1 block text-base">{Number(value).toLocaleString()}</b></div>)}</div>
    </section>
    <section className="rounded-xl border border-border bg-card p-4"><h2 className="mb-3 font-semibold">实时流量来源</h2><div className="space-y-2">
     {data.sources.slice(0,5).map(s=><div key={s.source+s.trafficType} className="grid grid-cols-[98px_1fr_43px] items-center gap-2 text-xs"><span className="truncate" title={s.source}>{s.source}</span><span className="h-2 rounded-full bg-secondary"><span className="block h-2 rounded-full bg-indigo-500" style={{width:(100*s.sessions/maxSource)+"%"}}/></span><span className="text-right tabular-nums">{s.sessions}</span></div>)}
     {!data.sources.length&&<p className="text-xs text-muted-foreground">暂无来源事件</p>}</div>
    </section>
   </div>
  </div>
  <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-2">
   <section className="min-w-0 rounded-xl border border-border bg-card p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">最近成交记录</h2><span className="text-xs text-muted-foreground">近1小时已追踪购买事件</span></div>
    <div className="overflow-x-auto"><table className="min-w-[490px] w-full text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr><th className="py-2">商品</th><th>地区</th><th>来源</th><th>时间</th><th className="text-right">金额</th></tr></thead>
     <tbody>{data.recentOrders.slice(0,6).map((o,i)=><tr className="border-b border-border/50" key={o.transactionId+o.occurredAt+i}><td className="py-2"><div className="flex items-center gap-2">
      {o.thumbnailUrl?<span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded border border-border"><SaleorImage src={o.thumbnailUrl} srcSet={o.thumbnailUrl+" 64w"} sizes="36px" alt={o.productName}/></span>:<span className="block h-9 w-9 shrink-0 rounded bg-secondary"/>}
      <span title={o.productName} className="line-clamp-2 max-w-[150px] font-medium">{o.productName||o.transactionId||"订单"}</span></div></td><td>{o.countryCode}</td><td>{o.source}</td><td className="whitespace-nowrap">{formatTime(o.occurredAt)}</td><td className="whitespace-nowrap text-right font-medium">{formatMoney(o.value,o.currency)}</td></tr>)}</tbody>
    </table>{!data.recentOrders.length&&<p className="py-8 text-center text-xs text-muted-foreground">暂无成交事件</p>}</div>
   </section>
   <section className="min-w-0 rounded-xl border border-border bg-card p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">此刻最活跃商品</h2><span className="text-xs text-muted-foreground">近5分钟</span></div>
    <div className="overflow-x-auto"><table className="min-w-[420px] w-full text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr><th className="py-2">商品</th><th className="text-right">浏览</th><th className="text-right">加购</th><th className="text-right">成交</th></tr></thead>
     <tbody>{data.topProducts.slice(0,7).map(p=><tr className="border-b border-border/50" key={p.itemKey}><td className="py-2"><div className="flex items-center gap-2">
      {p.thumbnailUrl?<span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded border border-border"><SaleorImage src={p.thumbnailUrl} srcSet={p.thumbnailUrl+" 64w"} sizes="36px" alt={p.itemName}/></span>:<span className="block h-9 w-9 shrink-0 rounded bg-secondary"/>}
      <div><span title={p.itemName} className="line-clamp-2 max-w-[200px] font-medium">{p.itemName||p.itemKey}</span><span className="text-[10px] text-muted-foreground">{p.categoryName||p.sku}</span></div></div></td><td className="text-right">{p.viewSessions}</td><td className="text-right">{p.addToCartSessions}</td><td className="text-right">{p.purchaseSessions}</td></tr>)}</tbody>
    </table>{!data.topProducts.length&&<p className="py-8 text-center text-xs text-muted-foreground">暂无商品活动</p>}</div>
   </section>
  </div>
  <section className="mt-4 rounded-xl border border-border bg-card p-4"><h2 className="mb-3 font-semibold">实时地区</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{data.countries.slice(0,5).map(c=><div key={c.countryCode} className="rounded-lg border border-border p-3"><div className="flex items-center justify-between text-xs"><span>{c.countryCode}</span><b>{c.sessions}</b></div><div className="mt-2 h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-emerald-500" style={{width:(100*c.sessions/maxCountry)+"%"}}/></div></div>)}</div></section>
  {detail&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={()=>setDetail(null)}><section role="dialog" aria-modal="true" aria-label="行为详情" onMouseDown={e=>e.stopPropagation()} className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">行为详情 · {labels[detail.name]??detail.name}</h2><button onClick={()=>setDetail(null)} className="rounded-lg border border-border px-3 py-1 text-sm">关闭</button></div><dl className="grid grid-cols-[100px_1fr] gap-3 text-sm">{[["事件时间",detail.occurredAt],["国家/地区",detail.countryCode],["来源",detail.source],["渠道",detail.channel],["商品",detail.itemName||"—"],["支付方式",detail.method||"—"],["错误代码",detail.errorCode||"—"],["金额",detail.currency?formatMoney(detail.value,detail.currency):"—"]].map(([label,value])=><div key={label} className="col-span-2 grid grid-cols-[100px_1fr] border-b border-border pb-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl></section></div>}
 </main>;
}