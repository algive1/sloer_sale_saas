"use client";

import { useCallback, useEffect, useState } from "react";
import type { TranslationItem, TranslationJob } from "@/plugins/ai-translations/store";
import type { TranslatedFields } from "@/plugins/ai-translations/policy";

type Brand={id:string;name:string;channels:string[];localesByChannel:Record<string,string[]>};
type Coverage={locale:string;present:number;total:number};
type Props={brands:Brand[];coverage:Coverage[];storageReady:boolean;workerReady:boolean;
  publisherReady:boolean;saleorReady:boolean};
type JobDetails={job:TranslationJob;items:TranslationItem[]};
const FIELDS = [{key:"name",label:"商品名"},{key:"description",label:"商品描述"},
  {key:"seoTitle",label:"SEO 标题"},{key:"seoDescription",label:"SEO 描述"}] as const;
const API="/ops/translations/api";

export function TranslationCenter({brands,coverage,storageReady,workerReady,publisherReady,saleorReady}:Props) {
  const [siteId,setSiteId]=useState(brands[0]?.id??"");
  const brand=brands.find(b=>b.id===siteId);
  const [channel,setChannel]=useState(brands[0]?.channels[0]??"");
  const locales=brand?.localesByChannel[channel]?.filter(l=>l!=="en")??[];
  const [locale,setLocale]=useState(locales[0]??"");
  const [jobs,setJobs]=useState<TranslationJob[]>([]);
  const [selected,setSelected]=useState("");
  const [details,setDetails]=useState<JobDetails|null>(null);
  const [drafts,setDrafts]=useState<Record<string,TranslatedFields>>({});
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const ready=storageReady&&saleorReady;
  const currentJob=jobs.find(j=>j.channel===channel&&j.locale===locale);
  const allPagesQueued=Boolean(currentJob&&currentJob.nextCursor===null &&
    currentJob.queued===0&&currentJob.draft===0&&currentJob.approved===0);
  const currentLocale=locales.includes(locale)?locale:locales[0]??"";
  const currentChannel=brand?.channels.includes(channel)?channel:brand?.channels[0]??"";

  const load=useCallback(async (jobId?:string)=>{
    if(!storageReady||!siteId)return;
    setLoading(true);
    try {
      const params=new URLSearchParams({siteId,...(jobId?{jobId}:{})});
      const response=await fetch(API+"?"+params.toString(),{cache:"no-store",credentials:"same-origin"});
      const body=await response.json() as {error?:string;jobs?:TranslationJob[]} & Partial<JobDetails>;
      if(!response.ok)throw new Error(body.error??"无法读取翻译任务");
      if(jobId && body.job && body.items) {
        setDetails({job:body.job,items:body.items});
        setDrafts(Object.fromEntries(body.items.map(item=>[item.itemId,{...item.translation}])));
      } else setJobs(body.jobs??[]);
    }catch(error){setMessage(error instanceof Error?error.message:"读取失败");}
    finally{setLoading(false);}
  },[storageReady,siteId]);

  useEffect(()=>{
    setSelected("");setDetails(null);setMessage("");
    void load();
  },[load]);

  async function mutate(body:Record<string,unknown>,reloadId?:string) {
    setBusy(true);setMessage("");
    try {
      const response=await fetch(API,{method:"POST",credentials:"same-origin",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({siteId,channel:currentChannel,locale:currentLocale,...body})});
      const result=await response.json() as {error?:string;job?:TranslationJob};
      if(!response.ok)throw new Error(result.error??"操作失败");
      if(result.job?.id){setSelected(result.job.id);await Promise.all([load(),load(result.job.id)]);}
      else {await Promise.all([load(),reloadId?load(reloadId):Promise.resolve()]);}
      setMessage(body.action==="create"?"任务已排队，等待独立 Worker 处理。":body.action==="publish"?
        "已写入 Saleor；请打开对应店铺核对商品内容。":"审核修改已保存。");
    }catch(error){setMessage(error instanceof Error?error.message:"操作失败");}
    finally{setBusy(false);}
  }

  function chooseBrand(value:string) {
    const b=brands.find(item=>item.id===value);
    if(!b)return;
    const c=b.channels[0]??"";
    setSiteId(value);setChannel(c);setLocale(b.localesByChannel[c]?.find(l=>l!=="en")??"");
  }
  function chooseChannel(value:string) {
    setChannel(value);setLocale(brand?.localesByChannel[value]?.find(l=>l!=="en")??"");
  }
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {label:"已定义 UI 语言",value:coverage.length},
          {label:"UI 文案完整",value:coverage.filter(c=>c.present===c.total).length},
          {label:"UI 文案待补",value:coverage.filter(c=>c.present<c.total).length},
          {label:"翻译任务",value:jobs.length},
        ].map(card=><article key={card.label} className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-xs text-stone-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</p>
        </article>)}
      </section>
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">网站语言覆盖率</h2>
            <p className="mt-1 text-xs text-stone-500">这里只计算前台 UI 文案，不代表商品、装修页面、邮件与政策已完成翻译。</p></div>
          <span className="text-xs text-stone-500">{coverage[0]?.total??0} 个英文基准字段</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coverage.map(item=><div key={item.locale} className="rounded-lg border border-stone-100 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium uppercase">{item.locale}</span>
              <span className="tabular-nums text-stone-500">{item.present}/{item.total}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-indigo-600" style={{width:(item.total?
                Math.round(item.present/item.total*100):0)+"%"}}/>
            </div>
          </div>)}
        </div>
      </section>
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold">商品翻译任务</h2>
            <p className="mt-1 text-xs text-stone-500">每批最多 10 件商品。AI 后台处理后，逐条审核；未获批准不会发布。</p></div>
          <button type="button" disabled={!storageReady||loading} onClick={()=>void load()}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm disabled:opacity-40">刷新任务</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-stone-600">品牌
            <select aria-label="选择品牌" className="mt-1 block w-full rounded-lg border p-2 text-stone-900"
              value={siteId} onChange={e=>chooseBrand(e.target.value)}>
              {brands.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-stone-600">销售市场
            <select aria-label="选择市场" className="mt-1 block w-full rounded-lg border p-2 text-stone-900"
              value={currentChannel} onChange={e=>chooseChannel(e.target.value)}>
              {brand?.channels.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm text-stone-600">目标语言
            <select aria-label="目标语言" className="mt-1 block w-full rounded-lg border p-2 text-stone-900"
              value={currentLocale} onChange={e=>setLocale(e.target.value)}>
              {locales.map(c=><option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={!ready||!currentLocale||busy||!workerReady||allPagesQueued}
            onClick={()=>void mutate({action:"create",count:10})}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy?"处理中…":allPagesQueued?"本市场商品已全部进入任务":"创建或继续下一批（最多 10 件）"}
          </button>
          <span className="self-center text-xs text-stone-500">
            {!storageReady?"需配置 libSQL 数据库":!saleorReady?"需配置 Saleor 专用 Token":
              !workerReady?"需配置 AI Worker 与服务":"已配置后台任务，需部署定时 Worker 轮询"}
          </span>
        </div>
        {message&&<p role="status" className="mt-3 rounded-lg bg-stone-100 p-3 text-sm">{message}</p>}
        <div className="mt-5 space-y-2">
          {jobs.map(job=><button type="button" key={job.id} onClick={()=>{
              setSelected(job.id);void load(job.id);}}
            className={"flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm hover:bg-stone-50 "+
              (selected===job.id?"border-stone-800":"border-stone-200")}>
            <span className="font-medium">{job.channel} · {job.locale.toUpperCase()}</span>
            <span className="text-stone-500">{job.total} 件 · 待处理 {job.queued} · 待审 {job.draft} · 已批准 {job.approved} · 已发布 {job.published} · 异常 {job.failed}</span>
          </button>)}
          {jobs.length===0&&<p className="rounded-lg border border-dashed p-5 text-sm text-stone-500">
            尚无该品牌的翻译任务。</p>}
        </div>
      </section>
      {details&&details.job.id===selected&&<section className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">逐条审核译文 · {details.job.locale.toUpperCase()}</h2>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm"
            onClick={()=>void load(details.job.id)}>刷新生成结果</button>
        </div>
        <div className="space-y-5">
          {details.items.map(item=><article key={item.itemId} className="rounded-lg border border-stone-200 p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="font-semibold">{item.slug}</h3>
                <p className="mt-1 text-xs text-stone-500">状态：{item.status} · 版本 {item.revision}</p></div>
              <div className="flex flex-wrap gap-2">
                {(["draft","approved","rejected"] as const).includes(item.status as "draft"|"approved"|"rejected")&&<>
                  <button disabled={busy} type="button" onClick={()=>void mutate({action:"reject",jobId:item.jobId,itemId:item.itemId,revision:item.revision},item.jobId)}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40">退回</button>
                  <button disabled={busy} type="button" onClick={()=>void mutate({action:"edit",jobId:item.jobId,itemId:item.itemId,
                      revision:item.revision,translation:drafts[item.itemId]},item.jobId)}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40">保存修改</button>
                  <button disabled={busy} type="button" onClick={()=>void mutate({action:"approve",jobId:item.jobId,itemId:item.itemId,
                      revision:item.revision,translation:drafts[item.itemId]},item.jobId)}
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-40">批准</button>
                </>}
                {item.status==="failed"&&
                  <button type="button" disabled={busy}
                    onClick={()=>void mutate({action:"retry",jobId:item.jobId,itemId:item.itemId,revision:item.revision},item.jobId)}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40">重新排队</button>}
                {item.status==="approved"&&publisherReady&&
                  <button type="button" disabled={busy}
                    onClick={()=>{if(window.confirm("确认将本条审核译文发布至 Saleor 吗？写入后影响该商品的所有 Channel。"))void mutate({
                      action:"publish",jobId:item.jobId,itemId:item.itemId,revision:item.revision},item.jobId);}}
                    className="rounded-lg bg-indigo-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">
                    发布到 Saleor
                  </button>}
              </div>
            </header>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {FIELDS.filter(f=>item.source[f.key]).map(field=><div key={field.key} className="grid gap-1">
                <label className="text-xs font-medium text-stone-500">{field.label} · 原文</label>
                <p className="max-h-32 overflow-y-auto rounded-lg bg-stone-50 p-3 text-sm whitespace-pre-wrap break-words">
                  {item.source[field.key]}</p>
                <label htmlFor={item.itemId+"-"+field.key} className="text-xs font-medium text-stone-500">
                  {field.label} · 译文</label>
                <textarea id={item.itemId+"-"+field.key} rows={field.key==="description"?4:2}
                  disabled={!["draft","approved","rejected"].includes(item.status)}
                  className="w-full rounded-lg border border-stone-200 p-3 text-sm disabled:bg-stone-50"
                  value={drafts[item.itemId]?.[field.key]??""}
                  onChange={e=>setDrafts(prev=>({...prev,[item.itemId]:{...prev[item.itemId],[field.key]:e.target.value}}))}/>
              </div>)}
            </div>
          </article>)}
        </div>
        {!publisherReady&&<p className="mt-4 text-xs text-stone-500">
          当前发布不可用：需专用 Saleor Token、显式开启写入；多品牌共享商品须先完成独立翻译验证。
        </p>}
      </section>}
    </div>
  );
}
