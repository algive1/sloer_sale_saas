import { Suspense } from "react";
import Link from "next/link";
import { io } from "next/cache";
import { readProductReport } from "@/lib/analytics/product-report";
import { readTrafficReport } from "@/lib/analytics/traffic-report";
import { fetchSaleorOrders } from "@/lib/analytics/saleor-ops-orders";
import { reminderEmailConfigured } from "@/lib/analytics/payment-reminders";
import { RecentOrdersTable } from "./recent-orders";
import { readOverviewDetails, readOverviewFinances } from "@/lib/analytics/overview-details";
import { readAnalyticsSummary } from "@/lib/analytics/first-party-store";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";
import { OperationsOverviewV3 } from "./operations-overview-v3";

type Params = {
  days?: string;
  finance?: string;
  financeFrom?: string;
  financeTo?: string;
  region?: string;
  regionFrom?: string;
  regionTo?: string;
};

const stages = [
  ["page_viewed","访问"],
  ["product_viewed","商品浏览"],
  ["product_added_to_cart","加入购物车"],
  ["cart_viewed","查看购物车"],
  ["checkout_started","开始结账"],
  ["payment_method_selected","选择支付"],
  ["checkout_completed","购买成功"],
] as const;

const eventNames: Record<string,string> = {
  page_viewed:"页面浏览",
  product_viewed:"商品浏览",
  wishlist_added:"加入收藏",
  product_added_to_cart:"加入购物车",
  cart_viewed:"查看购物车",
  checkout_started:"开始结账",
  payment_method_selected:"选择支付方式",
  checkout_completed:"购买完成",
  payment_failed:"支付失败",
  checkout_failed:"结账失败",
  refund_completed:"订单退款",
};

const money=(value:number,currency:string)=>{
  try {
    return currency==="UNKNOWN" ? value.toFixed(2)+" UNKNOWN" : new Intl.NumberFormat("en",{style:"currency",currency}).format(value);
  } catch { return value.toFixed(2)+" "+currency; }
};
export default function AnalyticsPage({searchParams}:{searchParams:Promise<Params>}) {
  return <Suspense fallback={<div className="mx-auto mt-10 h-96 max-w-7xl animate-pulse rounded-xl bg-secondary"/>}>
    <AnalyticsContent searchParams={searchParams}/>
  </Suspense>;
}
async function AnalyticsContent({searchParams}:{searchParams:Promise<Params>}) {
  await io();
  const query=await searchParams;
  const requested=Number(query.days??"30");
  const days=[7,30,90].includes(requested)?requested:30;
  if(!analyticsDatabaseConfigured())return <main className="mx-auto max-w-6xl px-6 py-12"><h1 className="text-2xl font-bold">经营数据中心</h1><section className="mt-6 rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">数据统计未启用</h2><p className="mt-2 text-sm text-muted-foreground">请先配置服务器的分析数据库连接，启用后将展示真实数据。</p></section></main>;

  const now=new Date();
  const range={from:new Date(now.getTime()-days*86_400_000),to:now,bucket:"day" as const};
  const financeRange=resolveFinanceRange(query,now);
  const regionRange=resolveFinanceRange({finance:query.region,financeFrom:query.regionFrom,financeTo:query.regionTo},now);
  const [summary,products,details,finances,regionReport,orders]=await Promise.all([
    readAnalyticsSummary(days),readProductReport(range),readOverviewDetails(range),readOverviewFinances(financeRange),readTrafficReport(regionRange),fetchSaleorOrders(25).catch(()=>null),
  ]);
  if(!summary)return <main className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">暂时无法加载数据，请稍后重试。</main>;

  const stagesMap=new Map(summary.funnel.map(s=>[s.name,s.count]));
  const visitors=summary.sessions;
  const purchaseSessions=stagesMap.get("checkout_completed")??0;
  const conversion=visitors>0?100*purchaseSessions/visitors:0;
  const sameCurrency=summary.revenueByCurrency.length===1?summary.revenueByCurrency[0]:null;
  const values=[
    ["访问会话",visitors.toLocaleString()],
    ["成交订单",summary.purchases.toLocaleString()],
    ["转化率",conversion.toFixed(2)+"%"],
    ["净成交额",sameCurrency?money(sameCurrency.value,sameCurrency.currency):"按币种查看"],
    ["客单价",sameCurrency&&summary.purchases?money(sameCurrency.value/summary.purchases,sameCurrency.currency):"—"],
    ["弃单结账",summary.abandonedCheckouts.toLocaleString()],
  ];
  const maxStage=Math.max(1,...stages.map(([key])=>stagesMap.get(key)??0));

  const dashboardBase=(process.env.SALEOR_DASHBOARD_URL??"").replace(/\/$/,"");
  const funnelCard = (<article className="h-full rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">转化漏斗</h2><p className="mt-1 text-xs text-muted-foreground">按各阶段去重会话统计</p></div>
          <Link href="/ops/analytics/checkout" className="rounded-lg border border-border px-3 py-1.5 text-xs">详情</Link>
        </div>
        <div className="space-y-2.5">{stages.map(([key,label])=>{
          const count=stagesMap.get(key)??0;
          return <div key={key} className="grid grid-cols-[90px_1fr_70px_65px] items-center gap-2 text-xs">
            <span>{label}</span><div className="h-2.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-slate-600" style={{width:(count/maxStage*100)+"%"}}/></div>
            <span className="text-right tabular-nums">{count.toLocaleString()}</span>
            <span className="text-right text-muted-foreground">{visitors?(count/visitors*100).toFixed(1)+"%":"—"}</span>
          </div>;
        })}</div>
      </article>);
  const healthCard = (<article className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">结账健康度</h2><Link href="/ops/analytics/checkout" className="rounded-lg border border-border px-3 py-1.5 text-xs">查看原因</Link></div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["开始结账",stagesMap.get("checkout_started")??0],
            ["选择支付",stagesMap.get("payment_method_selected")??0],
            ["支付失败事件",summary.paymentFailures],
            ["弃单会话",summary.abandonedCheckouts],
          ].map(([label,value])=><div key={label} className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{Number(value).toLocaleString()}</p>
          </div>)}
        </div>
      </article>);

  return <main className="mx-auto max-w-[1560px] px-4 py-8 lg:px-8">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-widest text-muted-foreground">OPERATIONS / ANALYTICS</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">经营数据中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">销售、转化、流量与商品表现</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {[["实时数据","realtime"],["流量分析","traffic"],["结账分析","checkout"],["商品分析","products"]].map(([label,url])=>
          <Link key={url} href={"/ops/analytics/"+url} className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-secondary">{label}</Link>
        )}
        <nav className="flex gap-1 rounded-lg border border-border bg-card p-1" aria-label="总览时间范围">
          {[7,30,90].map(day=><Link key={day} href={"/ops/analytics?days="+day} aria-current={days===day?"page":undefined} className={"rounded-md px-3 py-1.5 "+(days===day?"bg-foreground text-background":"hover:bg-secondary")}>{day}天</Link>)}
        </nav>
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="核心经营指标">
      {values.map(([label,value])=><div key={label} className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      </div>)}
    </section>
    {summary.revenueByCurrency.length>1&&<div className="mt-3 flex flex-wrap gap-2 text-xs">{summary.revenueByCurrency.map(r=>
      <span key={r.currency} className="rounded-lg border border-border bg-card px-3 py-2">{r.currency}：{money(r.value,r.currency)}</span>
    )}</div>}

    <div className="mt-5">
      <OperationsOverviewV3
        sources={details.sources}
        finances={finances}
        products={products.products}
        productTraffic={details.products}
        financeRange={query.finance??"7d"}
        financeFrom={query.financeFrom}
        financeTo={query.financeTo}
        financeBucket={financeRange.bucket}
        financeStart={financeRange.from.toISOString()}
        financeEnd={financeRange.to.toISOString()}
        days={days}
        dashboardBase={dashboardBase}
        funnel={funnelCard}
        health={healthCard}
        recentOrders={<RecentOrdersTable orders={orders} dashboardBase={dashboardBase} emailReady={reminderEmailConfigured()}/>}
        regionRange={query.region??"7d"}
        regionFrom={query.regionFrom}
        regionTo={query.regionTo}
        regionBucket={regionRange.bucket}
        regionTrend={{buckets:regionReport.trend.map(x=>x.bucket),rows:regionReport.countryTrend,countries:regionReport.countries.map(x=>x.countryCode).filter(c=>c!=="UNKNOWN").slice(0,5)}}
      />
    </div>


  </main>;
}

function resolveFinanceRange(query:Params,now:Date) {
  const dateOnly=(v?:string):Date|null=>{
    if(!v||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
    const d=new Date(v+"T00:00:00Z");
    return Number.isFinite(d.getTime())&&d.toISOString().startsWith(v)?d:null;
  };
  if(query.finance==="custom"){
    const from=dateOnly(query.financeFrom),last=dateOnly(query.financeTo);
    if(from&&last&&from<=last&&from<=now&&last.getTime()-from.getTime()<=365*86_400_000){
      const to=new Date(Math.min(now.getTime(),last.getTime()+86_400_000));
      return {from,to,bucket:(to.getTime()-from.getTime()<=2*86_400_000?"hour":"day") as "hour"|"day"};
    }
  }
  if(query.finance==="today")return {
    from:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())),
    to:now,bucket:"hour" as const,
  };
  if(query.finance==="month")return {
    from:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)),
    to:now,bucket:"day" as const,
  };
  const days=query.finance==="15d"?15:7;
  return {from:new Date(now.getTime()-days*86_400_000),to:now,bucket:"day" as const};
}
