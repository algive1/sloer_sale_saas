"use client";

import { useEffect, useState } from "react";
import { applyGeneratedImage,imageModuleChoices,IMAGE_SIZES,IMAGE_STYLES,type ImageSize,type ImageStyle } from "./ai-image-core";
import type { ThemeData } from "./template";

type Provider={id:string;title:string;baseUrl:string;model:string;active:boolean};
type ProviderList={ready?:boolean;items?:Provider[];allowedEndpoints?:string[];error?:string};
type Generated={image?:{base64:string;mime:string;width:number;provider:string;model:string};error?:string};

export function ThemeAiImageAssistant({
  open,onClose,channel,locale,getDocument,onApply,
}:{
  open:boolean;onClose:()=>void;channel:string;locale:string;
  getDocument:()=>ThemeData;
  onApply:(next:ThemeData,previous:ThemeData)=>boolean;
}){
  const [providers,setProviders]=useState<Provider[]>([]);
  const [endpoints,setEndpoints]=useState<string[]>([]);
  const [ready,setReady]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [title,setTitle]=useState("");
  const [endpoint,setEndpoint]=useState("https://api.openai.com/v1");
  const [model,setModel]=useState("gpt-image-1");
  const [apiKey,setApiKey]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [prompt,setPrompt]=useState("");
  const [size,setSize]=useState<ImageSize>("1536x1024");
  const [style,setStyle]=useState<ImageStyle>("editorial");
  const [blockId,setBlockId]=useState("");
  const [generated,setGenerated]=useState<Generated["image"]|null>(null);
  const [undo,setUndo]=useState<{before:ThemeData;after:ThemeData}|null>(null);
  const active=providers.find(p=>p.active);
  const blocks=imageModuleChoices(getDocument());
  const scope="/ops/themes/ai/providers?"+new URLSearchParams({channel});

  useEffect(()=>{
    const controller=new AbortController();
    fetch(scope,{cache:"no-store",signal:controller.signal})
      .then(async r=>await r.json() as ProviderList)
      .then(json=>{
        if(controller.signal.aborted)return;
        setProviders(json.items??[]);setEndpoints(json.allowedEndpoints??[]);
        setReady(Boolean(json.ready));
        setEndpoint(json.allowedEndpoints?.[0]??"https://api.openai.com/v1");
        if(json.error)setMessage(json.error);
      }).catch(()=>{if(!controller.signal.aborted)setMessage("模型配置读取失败");});
    return()=>controller.abort();
  },[scope]);
  async function refresh(){
    const r=await fetch(scope,{cache:"no-store"});
    const j=await r.json() as ProviderList;
    if(!r.ok)throw new Error(j.error??"无法读取配置");
    setProviders(j.items??[]);setEndpoints(j.allowedEndpoints??[]);
  }
  async function addProvider(){
    if(!ready||busy)return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/ops/themes/ai/providers",{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
        body:JSON.stringify({action:"create",channel,title,baseUrl:endpoint,model,apiKey}),
      });
      const j=await r.json() as {error?:string};
      if(!r.ok)throw new Error(j.error??"保存失败");
      setApiKey("");setTitle("");await refresh();
      setMessage("图片模型已加密保存。可点击启用切换模型。");
    }catch(e){setMessage(e instanceof Error?e.message:"保存失败");}
    finally{setBusy(false);}
  }
  async function changeProvider(id:string,remove:boolean){
    if(busy)return;
    if(remove&&!window.confirm("删除此模型配置及其密钥？"))return;
    setBusy(true);setMessage("");
    try{
      const r=remove
        ?await fetch("/ops/themes/ai/providers?"+new URLSearchParams({channel,id}),{method:"DELETE"})
        :await fetch("/ops/themes/ai/providers",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({channel,action:"activate",id})});
      const j=await r.json() as {error?:string};
      if(!r.ok)throw new Error(j.error??"操作失败");
      await refresh();setGenerated(null);
      setMessage(remove?"模型配置已删除":"已切换模型，下次生成使用新配置。");
    }catch(e){setMessage(e instanceof Error?e.message:"模型切换失败");}
    finally{setBusy(false);}
  }
  async function generate(){
    if(busy||!active)return;
    if(!prompt.trim()){setMessage("请输入图片需求");return;}
    setBusy(true);setMessage("");setGenerated(null);
    try{
      const response=await fetch("/ops/themes/ai/images/generate",{
        method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",
        body:JSON.stringify({channel,locale,prompt,size,style}),
      });
      const json=await response.json() as Generated;
      if(!response.ok||!json.image)throw new Error(json.error??"图片生成失败");
      setGenerated(json.image);
      setMessage("图片已生成。确认使用后才会上传素材并修改当前草稿；不会自动发布。");
    }catch(e){setMessage(e instanceof Error?e.message:"生成失败");}
    finally{setBusy(false);}
  }
  async function apply(){
    if(busy||!generated||!blockId)return;
    setBusy(true);setMessage("");
    const before=structuredClone(getDocument());
    try{
      // Never save a provider's short-lived URL or a base64 data URI in a theme.
      // Upload the compressed bytes to this store's existing authenticated Saleor media endpoint.
      const bytes=Uint8Array.from(atob(generated.base64),c=>c.charCodeAt(0));
      const form=new FormData();
      form.append("file",new File([bytes],"ai-storefront-"+Date.now()+".webp",{type:"image/webp"}));
      const r=await fetch("/ops/themes/upload?"+new URLSearchParams({channel}),{
        method:"POST",body:form,credentials:"same-origin",
      });
      const data=await r.json() as {url?:string;error?:string};
      if(!r.ok||!data.url)throw new Error(data.error??"图片存储失败");
      const next=applyGeneratedImage(before,blockId,data.url);
      if(!onApply(next,before))throw new Error("页面已变化，请重新选择模块再应用图片");
      setUndo({before,after:next});setGenerated(null);
      setMessage("图片已上传并应用到中间预览。请保存草稿或保存为模板，发布仍需单独确认。");
    }catch(e){setMessage(e instanceof Error?e.message:"图片应用失败");}
    finally{setBusy(false);}
  }
  if(!open)return null;
  return <aside aria-label="AI 图片生成" className="fixed bottom-4 right-4 top-16 z-50 flex w-[min(410px,calc(100vw-32px))] flex-col rounded-xl border border-stone-200 bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b p-4">
      <div><h2 className="text-base font-semibold">AI 图片生成</h2>
        <p className="text-xs text-stone-500">生成 · 预览 · 应用模块 · 手动发布</p></div>
      <button type="button" onClick={onClose} aria-label="关闭 AI 图片面板" className="rounded px-2 py-1 text-xl">×</button>
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div className="rounded-lg bg-stone-50 p-3">
        <div className="flex items-center justify-between">
          <div><p className="text-xs text-stone-500">当前图片模型</p>
            <p className="text-sm">{active?active.title+" · "+active.model:"尚未配置"}</p></div>
          <button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>setShowSettings(v=>!v)}>模型设置</button>
        </div>
      </div>
      {showSettings?<section className="space-y-2 rounded-lg border p-3">
        <p className="text-xs text-stone-600">支持官方 Images API 和兼容 /images/generations 的中转站；中转站必须先在服务器白名单中配置。密钥仅在服务端加密保存。</p>
        <label className="block text-xs">图片接口地址
          <select aria-label="图片接口地址" value={endpoint} onChange={e=>setEndpoint(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-2 text-sm">
            {endpoints.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <input aria-label="服务商名称" placeholder="服务商名称" value={title} maxLength={64}
          onChange={e=>setTitle(e.target.value)} className="w-full rounded border px-3 py-2 text-sm"/>
        <input aria-label="图片模型 ID" placeholder="gpt-image-1 / 中转站图片模型 ID" value={model}
          maxLength={100} onChange={e=>setModel(e.target.value)} className="w-full rounded border px-3 py-2 text-sm"/>
        <input aria-label="API Key" type="password" autoComplete="off" placeholder="API Key"
          value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full rounded border px-3 py-2 text-sm"/>
        <button type="button" disabled={!ready||busy||!title.trim()||!apiKey.trim()||!endpoints.length}
          className="w-full rounded bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-40"
          onClick={()=>{void addProvider();}}>加密保存图片模型</button>
        {providers.map(p=><div key={p.id} className="flex gap-2 border-t pt-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{p.title} · {p.model}</span>
          {p.active?<span>使用中</span>:<button disabled={busy} onClick={()=>{void changeProvider(p.id,false);}} className="underline">启用</button>}
          <button disabled={busy} onClick={()=>{void changeProvider(p.id,true);}} className="text-red-700">删除</button>
        </div>)}
      </section>:null}
      <label className="block text-xs font-medium">图片将应用到
        <select aria-label="选择图片模块" value={blockId} onChange={e=>setBlockId(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2 text-sm">
          <option value="">选择横幅或图文模块</option>
          {blocks.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>
      {!blocks.length?<p className="text-xs text-stone-500">请先在左侧添加「首页大横幅」或「图文组合」模块。</p>:null}
      <label className="block text-xs font-medium">图片风格
        <select aria-label="图片风格" value={style} onChange={e=>setStyle(e.target.value as ImageStyle)}
          className="mt-1 w-full rounded border px-3 py-2 text-sm">
          {IMAGE_STYLES.map((v,i)=><option key={v} value={v}>{["杂志风","极简","轻奢","温暖生活","活动广告"][i]}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium">图片比例
        <select aria-label="图片比例" value={size} onChange={e=>setSize(e.target.value as ImageSize)}
          className="mt-1 w-full rounded border px-3 py-2 text-sm">
          {IMAGE_SIZES.map((v,i)=><option key={v} value={v}>{["方图 1:1","横图 3:2","竖图 2:3"][i]}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium">图片描述
        <textarea aria-label="图片生成描述" rows={4} maxLength={1000} value={prompt}
          onChange={e=>setPrompt(e.target.value)}
          placeholder="例如：浅金色背景的极简珠宝摄影，柔和自然光，为右侧标题保留留白。"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"/>
      </label>
      <button type="button" disabled={!active||!ready||busy||prompt.trim().length<4}
        onClick={()=>{void generate();}} className="w-full rounded bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-40">
        {busy?"正在处理…":"生成 1 张图片"}
      </button>
      {generated?<div className="space-y-2">
        <div role="img" aria-label="AI 生成图片预览" className="aspect-[3/2] w-full rounded bg-stone-100 bg-contain bg-center bg-no-repeat"
          style={{backgroundImage:'url("data:image/webp;base64,'+generated.base64+'")'}}/>
        <p className="text-xs text-stone-500">{generated.provider} · {generated.model} · WebP 已压缩</p>
        <button type="button" disabled={busy||!blockId} onClick={()=>{void apply();}}
          className="w-full rounded border border-stone-900 px-3 py-2 text-sm disabled:opacity-40">
          确认上传并应用到当前模块
        </button>
      </div>:null}
      {undo?<button type="button" disabled={busy} className="w-full rounded border px-3 py-2 text-xs"
        onClick={()=>{
          if(onApply(undo.before,undo.after)){
            setUndo(null);setMessage("已撤回本次 AI 图片应用。线上页面不受影响。");
          }else setMessage("当前草稿已更改，不能撤回旧版本；请使用编辑器的撤销功能。");
        }}>撤回本次图片应用</button>:null}
      {message?<p role="status" className="rounded bg-stone-100 px-3 py-2 text-xs">{message}</p>:null}
      <p className="text-xs text-stone-500">AI 图片可能存在商品细节、商标或文字错误。请人工核对，不要当作真实商品主图；满意后再保存与发布。</p>
    </div>
  </aside>;
}
