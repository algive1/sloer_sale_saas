"use client";
import { useState } from "react";
import Link from "next/link";
import { SaleorImage } from "@/ui/atoms/saleor-image";
import type { OpsOrder } from "@/lib/analytics/saleor-ops-orders";
import { reminderSkipReason } from "@/lib/analytics/reminder-policy";

type Props={orders:OpsOrder[]|null;dashboardBase:string;emailReady:boolean};
function amount(value:number,currency:string){
 try{return new Intl.NumberFormat("en",{style:"currency",currency}).format(value);}
 catch{return value.toFixed(2)+" "+currency;}
}
function state(o:OpsOrder){
 if(["CANCELED","RETURNED"].includes(o.status))return ["已取消","bad"];
 if(o.status==="FULFILLED")return ["已发货","good"];
 if(o.isPaid)return ["已支付待发货","good"];
 return ["待支付","warn"];
}
export function RecentOrdersTable({orders,dashboardBase,emailReady}:Props){
 const [busy,setBusy]=useState("");
 const [dialog,setDialog]=useState<OpsOrder|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 async function remind(order:OpsOrder){
  setBusy(order.id);setMessage(null);
  try{
   const r=await fetch("/ops/api/analytics/reminders/manual",{method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json","x-requested-with":"analytics"},body:JSON.stringify({orderId:order.id})});
   const data=await r.json() as {status?:string;reason?:string;error?:string};
   if(r.ok&&data.status==="sent")setMessage("付款提醒已提交邮件服务。");
   else setMessage("未发送："+(data.reason??data.error??"服务暂不可用"));
  }catch{setMessage("网络错误，发送状态未知；为防重复催付，请先检查发送日志。");}
  finally{setBusy("");setDialog(null);}
 }
 return <section className="min-w-0 rounded-xl border border-border bg-card p-4">
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div>
   <h2 className="font-semibold">最近订单</h2>
   <p className="text-xs text-muted-foreground">订单及支付状态以 Saleor 为准，非浏览事件推断</p>
  </div><div className="flex gap-2"><Link href="/ops/analytics/reminders" className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary">催付规则</Link>{dashboardBase&&<a className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary" href={dashboardBase+"/orders"} target="_blank" rel="noopener noreferrer">全部订单 ↗</a>}</div></div>
  {message&&<div role="status" className="mb-2 rounded-lg bg-secondary p-2 text-xs">{message}</div>}
  {orders===null?<p className="py-8 text-center text-sm text-muted-foreground">暂未配置 Saleor 订单读取权限，请设置 SALEOR_APP_TOKEN。</p>:
  <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-xs">
   <thead className="border-b border-border text-muted-foreground"><tr>{["商品","地区","来源","付款时间","金额","交易状态","支付方式","操作"].map(x=><th className="px-2 py-3 font-medium" key={x}>{x}</th>)}</tr></thead>
   <tbody>{orders.slice(0,10).map(o=>{
    const [label,kind]=state(o);
    const href=dashboardBase?dashboardBase+"/orders/"+encodeURIComponent(o.id):"";
    const canRemind=reminderSkipReason(o)===null;
    return <tr key={o.id} className="border-b border-border/50 last:border-0">
      <td className="py-2 pr-2"><div className="flex min-w-[174px] items-center gap-2">
       {o.thumbnailUrl?<span className="relative block h-10 w-10 shrink-0 overflow-hidden rounded border border-border"><SaleorImage src={o.thumbnailUrl} srcSet={o.thumbnailUrl+" 64w"} sizes="40px" alt={o.productName}/></span>:<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-secondary text-[10px]">无图</span>}
       <div><span className="line-clamp-2 max-w-[175px] font-medium" title={o.productName}>{o.productName}</span><span className="block text-[10px] text-muted-foreground">#{o.number}</span></div></div></td>
      <td className="px-2">{o.country}</td><td className="px-2">{o.source}</td>
      <td className="whitespace-nowrap px-2 text-muted-foreground">{o.paidAt?new Date(o.paidAt).toLocaleString("zh-CN"):"—"}</td>
      <td className="whitespace-nowrap px-2 font-medium">{amount(o.amount,o.currency)}</td>
      <td className="px-2"><span className={"rounded-full px-2 py-1 text-[11px] font-semibold "+(kind==="good"?"bg-emerald-50 text-emerald-700":kind==="bad"?"bg-rose-50 text-rose-700":"bg-amber-50 text-amber-700")}>{label}</span></td>
      <td className="px-2">{o.paymentMethod}</td>
      <td className="whitespace-nowrap px-2"><div className="flex gap-1">
       {href&&<a href={href} target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2 py-1 hover:bg-secondary">{o.isPaid&&o.status!=="FULFILLED"?"去发货":"查看"}</a>}
       {canRemind&&<button type="button" disabled={!emailReady||busy===o.id} title={!emailReady?"请先配置邮件服务":undefined} className="rounded border border-border px-2 py-1 disabled:opacity-40" onClick={()=>setDialog(o)}>催付</button>}
      </div></td>
    </tr>;
   })}</tbody>
  </table>{!orders.length&&<p className="p-8 text-center text-sm text-muted-foreground">暂无可展示订单</p>}</div>}
  {dialog&&<div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={()=>setDialog(null)}><section role="dialog" aria-modal="true" aria-label="确认催付" onMouseDown={e=>e.stopPropagation()} className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
   <h3 className="font-semibold">向客户发送付款提醒？</h3><p className="mt-2 text-sm text-muted-foreground">订单 #{dialog.number}，当前未付款。发送前会再次向 Saleor 检查支付状态；同一订单人工提醒仅允许一次，避免重复打扰。</p>
   <div className="mt-5 flex justify-end gap-2"><button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={()=>setDialog(null)}>取消</button><button disabled={Boolean(busy)} className="rounded-lg bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50" onClick={()=>void remind(dialog)}>{busy?"发送中":"确认发送"}</button></div>
  </section></div>}
 </section>;
}