"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { SaleorImage } from "@/ui/atoms/saleor-image";
import { FinanceComparisonChart } from "./finance-comparison-chart";
import { useEffect } from "react";
import type { OverviewSource, OverviewFinance, OverviewProductTraffic } from "@/lib/analytics/overview-details";
import type { ProductPerformanceRow } from "@/lib/analytics/product-report";

type Props = { sources: OverviewSource[]; finances: OverviewFinance[]; products: ProductPerformanceRow[]; productTraffic: OverviewProductTraffic[]; financeRange: string; financeFrom?: string; financeTo?: string; financeBucket: "hour"|"day"; financeStart: string; financeEnd: string; days: number };
const types = ["organic","paid","direct","referral","other"];
const labels: Record<string,string> = { organic:"自然搜索",paid:"付费广告",direct:"Direct",referral:"Referral",other:"其他" };
const colors = ["#424750","#858c95","#afb5bf","#d0d4da","#ebeef2"];
const fmt=(n:number)=>n.toLocaleString("zh-CN");
const pct=(n:number,d:number)=>d>0?(100*n/d).toFixed(1)+"%":"—";
const selectClass="rounded-lg border border-border bg-card px-2 py-1.5 text-xs";
const money=(v:number,c:string)=> c==="UNKNOWN" ? fmt(v)+" UNKNOWN" : new Intl.NumberFormat("en",{style:"currency",currency:c}).format(v);
function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
 useEffect(()=>{const handle=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};document.addEventListener("keydown",handle);return ()=>document.removeEventListener("keydown",handle);},[onClose]);
 return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
   <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl bg-card" onMouseDown={e=>e.stopPropagation()}>
    <header className="flex items-center justify-between border-b border-border p-5"><h2 className="font-semibold">{title}</h2><button type="button" className={selectClass} onClick={onClose}>关闭 ×</button></header>
    <div className="overflow-auto p-5">{children}</div>
   </div>
 </div>;
}
function MoneyCell({values}:{values:{currency:string;value:number}[]}) {
 return values.length ? <span className="flex flex-col text-right">{values.map(m=><span key={m.currency}>{money(m.value,m.currency)}</span>)}</span> : <span>—</span>;
}
function ProductTable({items,traffic}:{items:ProductPerformanceRow[];traffic:OverviewProductTraffic[]}) {
 const rate=(id:string,type:string)=>{const r=traffic.find(x=>x.itemKey===id&&x.trafficType===type);return r?pct(r.purchases,r.views):"—";};
 return <div className="overflow-x-auto"><table className="min-w-[790px] w-full text-xs">
 <thead><tr className="border-b border-border text-muted-foreground">{["商品","浏览","加购","订单","总转化率","付费转化率","自然转化率","成交商品金额"].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead>
 <tbody>{items.map(p=><tr className="border-b border-border/50" key={p.itemKey}>
 <td className="p-2"><div className="flex items-center gap-2">{p.thumbnailUrl?<span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded border border-border"><SaleorImage src={p.thumbnailUrl} srcSet={p.thumbnailUrl+" 64w"} alt={p.itemName} sizes="40px" className="object-cover"/></span>:<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-secondary text-[10px]">无图</span>}<div className="max-w-48"><span className="line-clamp-2" title={p.itemName}>{p.itemName}</span><small className="block text-muted-foreground">{p.sku||p.itemKey}</small></div></div></td>
 <td>{fmt(p.productViews)}</td><td>{fmt(p.addToCarts)}</td><td>{fmt(p.purchaseSessions)}</td><td>{pct(p.purchaseSessions,p.productViews)}</td><td>{rate(p.itemKey,"paid")}</td><td>{rate(p.itemKey,"organic")}</td><td><MoneyCell values={p.purchasedItemValue}/></td></tr>)}</tbody></table>
 {!items.length&&<p className="p-6 text-center text-sm text-muted-foreground">暂无商品数据</p>}</div>;
}

type CategorySummary = {
 key: string;
 name: string;
 products: number;
 views: number;
 carts: number;
 orders: number;
 paidViews: number;
 paidPurchases: number;
 organicViews: number;
 organicPurchases: number;
};
function CategoryTable({items,traffic}:{items:ProductPerformanceRow[];traffic:OverviewProductTraffic[]}) {
 const categories=new Map<string,CategorySummary>();
 for(const item of items){
   const key=item.categoryId||"UNCATEGORIZED";
   const old=categories.get(key)??{key,name:item.categoryName||"未识别分类",products:0,views:0,carts:0,orders:0,paidViews:0,paidPurchases:0,organicViews:0,organicPurchases:0};
   old.products++;old.views+=item.productViews;old.carts+=item.addToCarts;old.orders+=item.purchaseSessions;
   for(const row of traffic.filter(t=>t.itemKey===item.itemKey)){
     if(row.trafficType==="paid"){old.paidViews+=row.views;old.paidPurchases+=row.purchases;}
     if(row.trafficType==="organic"){old.organicViews+=row.views;old.organicPurchases+=row.purchases;}
   }
   categories.set(key,old);
 }
 const data=[...categories.values()].sort((a,b)=>b.views-a.views);
 return <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-xs">
   <thead><tr className="border-b border-border text-muted-foreground">{["分类","商品数","浏览","加购","订单","转化率","付费转化率","自然转化率"].map(t=><th className="p-2 text-left" key={t}>{t}</th>)}</tr></thead>
   <tbody>{data.slice(0,6).map(c=><tr key={c.key} className="border-b border-border/50">
     <td className="p-2 font-medium">{c.name}</td><td>{fmt(c.products)}</td><td>{fmt(c.views)}</td><td>{fmt(c.carts)}</td><td>{fmt(c.orders)}</td><td>{pct(c.orders,c.views)}</td><td>{pct(c.paidPurchases,c.paidViews)}</td><td>{pct(c.organicPurchases,c.organicViews)}</td>
   </tr>)}</tbody>
 </table>{!data.length&&<p className="p-6 text-center text-sm text-muted-foreground">暂无分类统计</p>}</div>;
}

export function OperationsOverviewV3({sources,finances,products,productTraffic,financeRange,financeFrom,financeTo,financeBucket,financeStart,financeEnd,days}:Props) {
 const countries=useMemo(()=>["ALL",...new Set(sources.map(s=>s.country).filter(s=>s!=="ALL"))],[sources]);
 const financeCountries=useMemo(()=>["ALL",...new Set(finances.map(f=>f.country).filter(c=>c!=="ALL"))],[finances]);
 const [country,setCountry]=useState("ALL");
 const [topCountry,setTopCountry]=useState("ALL");
 const [region,setRegion]=useState("ALL");
 const [currency,setCurrency]=useState("USD");
 const [mode,setMode]=useState("products");
 const [customOpen,setCustomOpen]=useState(false);
 const [dialog,setDialog]=useState<string|null>(null);
 const filtered=sources.filter(s=>s.country===country);
 const topRows=sources.filter(s=>s.country===topCountry);
 const topTotals={sessions:topRows.reduce((n,r)=>n+r.sessions,0),carts:topRows.reduce((n,r)=>n+r.carts,0),orders:topRows.reduce((n,r)=>n+r.orders,0)};
 const topRevenue=new Map<string,number>();
 topRows.forEach(r=>r.revenueByCurrency.forEach(m=>topRevenue.set(m.currency,(topRevenue.get(m.currency)||0)+m.value)));
 const sum=(field:"sessions"|"carts"|"orders")=>filtered.reduce((t,r)=>t+r[field],0);
 const totals={sessions:sum("sessions"),carts:sum("carts"),orders:sum("orders")};
 const currencies=new Map<string,number>();
 filtered.forEach(s=>s.revenueByCurrency.forEach(m=>currencies.set(m.currency,(currencies.get(m.currency)||0)+m.value)));
 const grouped=types.map(type=>{
  const rows=filtered.filter(x=>x.trafficType===type);
  const total=(f:"sessions"|"carts"|"orders"|"purchaseSessions")=>rows.reduce((n,r)=>n+r[f],0);
  const moneyByCurrency=new Map<string,number>();
  rows.forEach(r=>r.revenueByCurrency.forEach(m=>moneyByCurrency.set(m.currency,(moneyByCurrency.get(m.currency)||0)+m.value)));
  return {type,sessions:total("sessions"),carts:total("carts"),orders:total("orders"),purchases:total("purchaseSessions"),revenue:[...moneyByCurrency].map(([currency,value])=>({currency,value}))};
 });
 let cumulative=0;
 const stops=grouped.map((g,i)=>{const start=cumulative;cumulative+=totals.sessions?100*g.sessions/totals.sessions:0;return colors[i]+" "+start+"% "+cumulative+"%";});
 const financeRegions=finances.filter(r=>r.country===region);
 const currenciesInRegion=[...new Set(financeRegions.map(r=>r.currency))];
 const selectedCurrency=currenciesInRegion.includes(currency)?currency:currenciesInRegion[0];
 const finance=financeRegions.filter(f=>f.currency===selectedCurrency);
 const gross=finance.reduce((n,f)=>n+f.gross,0),refunds=finance.reduce((n,f)=>n+f.refunds,0);
 const share=(values:{currency:string;value:number}[])=>
  values.length?<span className="flex flex-col text-right">{values.map(m=><span key={m.currency} title={m.currency}>{m.currency} {pct(m.value,currencies.get(m.currency)||0)}</span>)}</span>:<span>—</span>;
 const sourcesTable=(all:boolean)=><div className="overflow-x-auto"><table className="min-w-[600px] w-full text-xs"><thead><tr className="border-b border-border">{["来源","流量","加购","订单","转化率","收入"].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{topRows.slice().sort((a,b)=>b.sessions-a.sessions).slice(0,all?undefined:5).map((r,i)=><tr key={i} className="border-b border-border/50"><td className="p-2">{r.source}<small className="ml-1 text-muted-foreground">{labels[r.trafficType]||r.trafficType}</small></td><td>{pct(r.sessions,topTotals.sessions)}</td><td>{pct(r.carts,topTotals.carts)}</td><td>{pct(r.orders,topTotals.orders)}</td><td>{pct(r.purchaseSessions,r.sessions)}</td><td>{r.revenueByCurrency.length?<span className="flex flex-col">{r.revenueByCurrency.map(m=><span key={m.currency}>{m.currency} {pct(m.value,topRevenue.get(m.currency)||0)}</span>)}</span>:"—"}</td></tr>)}</tbody></table></div>;
 return <div className="space-y-4">
  <div className="grid gap-4 xl:grid-cols-2">
   <section className="rounded-xl border border-border bg-card p-5">
    <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-semibold">流量构成</h2><label className="text-xs text-muted-foreground">地区 <select aria-label="选择流量地区" className={selectClass} value={country} onChange={e=>setCountry(e.target.value)}>{countries.map(c=><option key={c} value={c}>{c==="ALL"?"全部地区":c}</option>)}</select></label></div>
    <div className="grid items-center gap-4 lg:grid-cols-[130px_1fr]">
     <div className="relative mx-auto h-32 w-32 rounded-full" style={{background:totals.sessions?"conic-gradient("+stops.join(",")+")":"#e5e7eb"}}>
      <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-card"><b>{fmt(totals.sessions)}</b><small className="text-[10px] text-muted-foreground">会话</small></div>
     </div>
     <div className="overflow-x-auto"><table className="w-full min-w-[400px] text-xs"><thead><tr>{["渠道","流量","加购","订单","转化率","收入"].map(h=><th key={h} className="pb-2 text-right font-normal text-muted-foreground first:text-left">{h}</th>)}</tr></thead><tbody>{grouped.map((g,i)=><tr className="border-t border-border/50" key={g.type}>
      <td className="whitespace-nowrap py-2"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{background:colors[i]}}/>{labels[g.type]}</td><td className="text-right">{pct(g.sessions,totals.sessions)}</td><td className="text-right">{pct(g.carts,totals.carts)}</td><td className="text-right">{pct(g.orders,totals.orders)}</td><td className="text-right">{pct(g.purchases,g.sessions)}</td><td>{share(g.revenue)}</td></tr>)}</tbody></table></div>
    </div><p className="mt-3 text-xs text-muted-foreground">转化率按购买会话计算；收入按币种分别统计。</p>
   </section>
   <section className="rounded-xl border border-border bg-card p-5"><header className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Top 流量来源</h2><div className="flex items-center gap-2"><select aria-label="Top 来源地区" className={selectClass} value={topCountry} onChange={e=>setTopCountry(e.target.value)}>{countries.map(c=><option key={c} value={c}>{c==="ALL"?"全部地区":c}</option>)}</select><button type="button" className={selectClass} onClick={()=>setDialog("sources")}>查看全部</button></div></header>{sourcesTable(false)}</section>
  </div>
  <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
   <section className="rounded-xl border border-border bg-card p-5">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">商品表现</h2><div className="flex gap-2"><button type="button" className={selectClass} aria-pressed={mode==="categories"} onClick={()=>setMode("categories")}>商品分类</button><button type="button" className={selectClass} aria-pressed={mode==="products"} onClick={()=>setMode("products")}>具体商品</button><button type="button" className={selectClass} onClick={()=>setDialog("products")}>查看全部</button></div></header>
    {mode==="products"?<ProductTable items={products.slice(0,5)} traffic={productTraffic}/>:<CategoryTable items={products} traffic={productTraffic}/>}
   </section>
   <section className="rounded-xl border border-border bg-card p-5">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">经营趋势</h2><div className="flex flex-wrap gap-1">{[["today","今日"],["7d","近7日"],["15d","近15日"],["month","本月"]].map(([value,label])=><Link key={value} href={"/ops/analytics?days="+days+"&finance="+value} aria-current={financeRange===value?"page":undefined} className={selectClass+(financeRange===value?" bg-foreground text-background":"")}>{label}</Link>)}<button type="button" className={selectClass} aria-expanded={customOpen} onClick={()=>setCustomOpen(v=>!v)}>自定义</button><button type="button" className={selectClass} onClick={()=>setDialog("finance")}>详情</button></div></header>
    {customOpen&&<form id="finance-custom" action="/ops/analytics" className="mb-3 flex flex-wrap items-center gap-2 text-xs"><input type="hidden" name="finance" value="custom"/><input type="hidden" name="days" value={days}/><label>开始 <input className={selectClass} type="date" name="financeFrom" defaultValue={financeFrom} required/></label><label>结束 <input className={selectClass} type="date" name="financeTo" defaultValue={financeTo} required/></label><button className={selectClass} type="submit">应用</button></form>}
    <label className="text-xs text-muted-foreground">地区 <select className={selectClass} value={region} onChange={e=>setRegion(e.target.value)}>{financeCountries.map(c=><option value={c} key={c}>{c==="ALL"?"全站":c}</option>)}</select></label>
    <label className="ml-2 text-xs text-muted-foreground">币种 <select className={selectClass} value={selectedCurrency||""} onChange={e=>setCurrency(e.target.value)}>{currenciesInRegion.map(c=><option key={c}>{c}</option>)}</select></label>
    <div className="mt-4"><FinanceComparisonChart rows={finances} country={region} currency={selectedCurrency||""} bucket={financeBucket} from={financeStart} to={financeEnd}/></div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">{[["总销售额",gross],["退款",refunds],["运费",null],["净销售额",gross-refunds]].map(([title,value])=><div key={title} className="rounded-lg border border-border p-3"><p className="text-muted-foreground">{title}</p><b className="mt-2 block">{value===null||!selectedCurrency?"—":money(Number(value),selectedCurrency)}</b></div>)}</div>
    <p className="mt-2 text-xs text-muted-foreground" title="以已追踪完成结账金额扣除退款计算；运费需等待订单数据关联。">* 根据站内已追踪订单事件统计，非财务对账结果。</p>
   </section>
  </div>
  {dialog==="sources"&&<Dialog title="全部流量来源" onClose={()=>setDialog(null)}>{sourcesTable(true)}</Dialog>}
  {dialog==="products"&&<Dialog title="全部商品表现" onClose={()=>setDialog(null)}><ProductTable items={products} traffic={productTraffic}/></Dialog>}
  {dialog==="finance"&&<Dialog title="经营趋势详情" onClose={()=>setDialog(null)}><FinanceComparisonChart rows={finances} country={region} currency={selectedCurrency||""} bucket={financeBucket} from={financeStart} to={financeEnd}/><table className="w-full text-sm"><thead><tr>{["时间","地区","币种","总销售额","退款","净销售额"].map(t=><th className="p-2 text-left" key={t}>{t}</th>)}</tr></thead><tbody>{finance.map(f=><tr className="border-b border-border/50" key={f.bucket}><td className="p-2">{f.bucket}</td><td>{f.country}</td><td>{f.currency}</td><td>{money(f.gross,f.currency)}</td><td>{money(f.refunds,f.currency)}</td><td>{money(f.gross-f.refunds,f.currency)}</td></tr>)}</tbody></table></Dialog>}
  <div className="flex flex-wrap gap-3 border-t border-border pt-4 text-xs text-muted-foreground"><span>扩展分析：</span><Link href="/ops/analytics/traffic" className="underline">流量趋势与地区对比</Link><Link href="/ops/analytics/checkout" className="underline">支付健康度</Link><Link href="/ops/analytics/realtime" className="underline">实时数据</Link></div>
 </div>;
}
