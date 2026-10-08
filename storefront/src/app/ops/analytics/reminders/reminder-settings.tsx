"use client";
import {useState} from "react";
import type {PaymentReminderRule} from "@/lib/analytics/payment-reminders";

export function ReminderSettings({initial,emailReady,cronReady}:{initial:PaymentReminderRule;emailReady:boolean;cronReady:boolean}){
 const [rule,setRule]=useState(initial);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const update=(name:keyof PaymentReminderRule,value:boolean|number)=>setRule(v=>({...v,[name]:value}));
 async function save(){
  setSaving(true);setNotice("");
  try{
   const r=await fetch("/ops/api/analytics/reminders/rules",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-requested-with":"analytics"},body:JSON.stringify(rule)});
   const result=await r.json() as {rule?:PaymentReminderRule;error?:string};
   if(!r.ok||!result.rule)throw new Error(result.error??"保存失败");
   setRule(result.rule);setNotice("规则已保存。");
  }catch(e){setNotice(e instanceof Error?e.message:"保存失败");}
  finally{setSaving(false);}
 }
 return <section className="max-w-3xl rounded-xl border border-border bg-card p-6">
  <header><h2 className="text-lg font-semibold">付款提醒规则</h2><p className="mt-2 text-sm text-muted-foreground">仅针对 Saleor 已创建但仍未付款的有效订单。不会把弃单访问直接视为订单，也不会向已付款订单发送。</p></header>
  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
   <p className="rounded-lg bg-secondary p-3">邮件提供商：<b>{emailReady?"已配置":"未配置"}</b></p>
   <p className="rounded-lg bg-secondary p-3">定时任务密钥：<b>{cronReady?"已配置":"未配置"}</b></p>
  </div>
  <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={rule.enabled} disabled={!emailReady||!cronReady} onChange={e=>update("enabled",e.target.checked)}/><span className="font-medium">启用自动付款提醒</span></label>
  <div className="mt-4 grid gap-4 sm:grid-cols-3">{[
   {name:"firstAfterHours",label:"首次提醒（下单后小时）",min:1,max:168},
   {name:"secondAfterHours",label:"再次提醒（下单后小时）",min:2,max:720},
   {name:"dailyLimit",label:"最多每日发送（封）",min:1,max:20},
  ].map(f=><label key={f.name} className="text-xs text-muted-foreground">{f.label}<input type="number" min={f.min} max={f.max} value={rule[f.name as "firstAfterHours"|"secondAfterHours"|"dailyLimit"]} onChange={e=>update(f.name as keyof PaymentReminderRule,Number(e.target.value))} className="mt-2 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"/></label>)}</div>
  <div className="mt-5 rounded-lg border border-border p-4 text-xs leading-6 text-muted-foreground">
   <p>• 默认不发送。首次提醒和再次提醒分别最多一次，不会自动重试发送结果不确定的邮件。</p>
   <p>• 每日发送限制包含人工和自动提醒；自动规则需要服务器 Cron 按小时调用专用接口。</p>
   <p>• 需正确设置发件人域名及订单查询页面。邮件只用于订单付款提醒，不附加营销内容。</p>
  </div>
  <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground" role="status">{notice}</span><button disabled={saving||(!emailReady&&rule.enabled)||(!cronReady&&rule.enabled)} onClick={()=>void save()} className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40">{saving?"保存中":"保存规则"}</button></div>
 </section>;
}