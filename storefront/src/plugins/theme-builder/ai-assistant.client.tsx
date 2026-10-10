"use client";

import { useEffect, useState } from "react";
import type { ThemeData } from "./template";

type Provider={id:string;title:string;baseUrl:string;model:string;active:boolean};
type History={role:"user"|"assistant";content:string};
type ProviderResponse={ready?:boolean;items?:Provider[];allowedEndpoints?:string[];error?:string};
type Generated={data?:ThemeData;message?:string;provider?:string;model?:string;error?:string};

export function ThemeAiAssistant({
  open,onClose,channel,locale,pageType,getDocument,onApply,
}:{
  open:boolean;onClose:()=>void;
  channel:string;locale:string;pageType:"home"|"product";
  getDocument:()=>ThemeData;
  onApply:(next:ThemeData,original:ThemeData)=>boolean;
}){
  const [providers,setProviders]=useState<Provider[]>([]);
  const [allowed,setAllowed]=useState<string[]>([]);
  const [ready,setReady]=useState(false);
  const [title,setTitle]=useState("");
  const [endpoint,setEndpoint]=useState("https://api.openai.com/v1");
  const [model,setModel]=useState("");
  const [apiKey,setApiKey]=useState("");
  const [showSettings,setShowSettings]=useState(false);
  const [busy,setBusy]=useState(false);
  const [prompt,setPrompt]=useState("");
  const [mode,setMode]=useState<"page"|"block">("page");
  const [selectedId,setSelectedId]=useState("");
  const [history,setHistory]=useState<History[]>([]);
  const [message,setMessage]=useState("");
  const [undo,setUndo]=useState<ThemeData|null>(null);
  const [revision,setRevision]=useState(0);

  const scope=new URLSearchParams({channel});
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/ops/themes/ai/providers?"+scope,{signal:controller.signal,cache:"no-store"})
      .then(async r=>await r.json() as ProviderResponse)
      .then(data=>{
        if(controller.signal.aborted)return;
        setProviders(data.items??[]);
        setAllowed(data.allowedEndpoints??[]);
        setReady(Boolean(data.ready));
        if(data.allowedEndpoints?.length)setEndpoint(data.allowedEndpoints[0]);
        if(data.error)setMessage(data.error);
      })
      .catch(()=>{if(!controller.signal.aborted)setMessage("无法读取模型设置");});
    return()=>controller.abort();
  // Scope remounts this component in the parent on channel/locale/page changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[channel]);
  const active=providers.find(item=>item.active);
  const blocks=getDocument().content;
  void revision;

  async function reload(){
    const r=await fetch("/ops/themes/ai/providers?"+scope,{cache:"no-store"});
    const data=await r.json() as ProviderResponse;
    if(!r.ok)throw new Error(data.error??"无法读取模型配置");
    setProviders(data.items??[]);
    setAllowed(data.allowedEndpoints??[]);
    setReady(Boolean(data.ready));
  }
  async function addProvider(){
    if(!title.trim()||!model.trim()||!apiKey.trim()){setMessage("请填写名称、模型和 API Key");return;}
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/ops/themes/ai/providers",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"create",channel,title,baseUrl:endpoint,model,apiKey}),
      });
      const data=await r.json() as {error?:string};
      if(!r.ok)throw new Error(data.error??"保存失败");
      setApiKey("");setTitle("");setModel("");
      await reload();
      setMessage("模型配置已加密保存。如需切换，点击对应服务商的启用按钮。");
    }catch(e){setMessage(e instanceof Error?e.message:"配置失败");}
    finally{setBusy(false);}
  }
  async function activate(id:string){
    setBusy(true);
    try{
      const r=await fetch("/ops/themes/ai/providers",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"activate",channel,id}),
      });
      const data=await r.json() as {error?:string};
      if(!r.ok)throw new Error(data.error??"切换失败");
      await reload();setMessage("已切换 AI 模型，下次生成使用新配置。");
    }catch(e){setMessage(e instanceof Error?e.message:"切换失败");}
    finally{setBusy(false);}
  }
  async function remove(id:string){
    if(!window.confirm("确定删除这个模型配置及其 API Key 吗？"))return;
    setBusy(true);
    try{
      const r=await fetch("/ops/themes/ai/providers?"+new URLSearchParams({channel,id}),{method:"DELETE"});
      const data=await r.json() as {error?:string};
      if(!r.ok)throw new Error(data.error??"删除失败");
      await reload();setMessage("模型配置已删除。");
    }catch(e){setMessage(e instanceof Error?e.message:"删除失败");}
    finally{setBusy(false);}
  }
  async function generate(){
    if(busy)return;
    if(mode==="block"&&!selectedId){setMessage("请选择要修改的模块");return;}
    if(prompt.trim().length<2){setMessage("请描述你希望的页面效果");return;}
    setBusy(true);setMessage("");
    const previous=structuredClone(getDocument());
    try{
      const r=await fetch("/ops/themes/ai/generate",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({channel,locale,pageType,mode,prompt,selectedId,document:previous,history}),
      });
      const data=await r.json() as Generated;
      if(!r.ok||!data.data)throw new Error(data.error??"生成失败");
      if(!onApply(data.data,previous))throw new Error("页面已发生变化，请重新生成");
      setUndo(previous);
      const reply=data.message??"AI 已生成草稿，请检查中间预览。";
      setHistory(prev=>[...prev,{role:"user" as const,content:prompt.trim().slice(0,600)},
        {role:"assistant" as const,content:reply.slice(0,600)}].slice(-12));
      setPrompt("");
      setMessage(reply+" 已预览，尚未保存或发布。");
      setRevision(v=>v+1);
    }catch(e){setMessage(e instanceof Error?e.message:"AI 生成失败");}
    finally{setBusy(false);}
  }
  if(!open)return null;
  return <aside aria-label="AI 装修助手" className="fixed bottom-4 right-4 top-16 z-50 flex w-[min(410px,calc(100vw-32px))] flex-col rounded-xl border border-stone-200 bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b border-stone-200 p-4">
      <div><h2 className="text-base font-semibold">AI 装修助手</h2>
        <p className="text-xs text-stone-500">生成后直接预览 · 不自动发布</p></div>
      <button type="button" aria-label="关闭 AI 面板" onClick={onClose} className="rounded px-2 py-1 text-xl">×</button>
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div className="rounded-lg bg-stone-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">当前模型</p>
            <p className="truncate text-sm">{active?active.title+" · "+active.model:"尚未配置"}</p>
          </div>
          <button type="button" onClick={()=>setShowSettings(v=>!v)}
            className="rounded border px-3 py-1.5 text-xs">模型设置</button>
        </div>
      </div>
      {showSettings?<section className="space-y-3 rounded-lg border p-3">
        <h3 className="text-sm font-semibold">添加服务商 / 第三方中转站</h3>
        <p className="text-xs text-stone-500">第三方地址须先在服务器 THEME_AI_ALLOWED_ENDPOINTS 中授权。API Key 仅加密保存在服务端，不会再次展示。</p>
        {allowed.length?<select aria-label="AI 接口地址" value={endpoint} onChange={e=>setEndpoint(e.target.value)}
          className="w-full rounded border px-2 py-2 text-sm">
          {allowed.map(x=><option key={x} value={x}>{x}</option>)}
        </select>:<p className="text-xs text-red-700">当前没有可用的 AI 地址</p>}
        <input aria-label="服务商名称" placeholder="例如 OpenAI / 自定义中转站" maxLength={64}
          value={title} onChange={e=>setTitle(e.target.value)} className="w-full rounded border px-3 py-2 text-sm"/>
        <input aria-label="模型名称" placeholder="填写服务商提供的精确模型 ID" maxLength={100}
          value={model} onChange={e=>setModel(e.target.value)} className="w-full rounded border px-3 py-2 text-sm"/>
        <input aria-label="API Key" type="password" autoComplete="off" placeholder="sk-…（仅保存时提交）"
          value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full rounded border px-3 py-2 text-sm"/>
        <button type="button" disabled={!ready||busy||!allowed.length} onClick={()=>{void addProvider();}}
          className="w-full rounded bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-40">加密保存配置</button>
        <div className="space-y-2">
          {providers.map(item=><div key={item.id} className="flex items-center gap-2 border-t pt-2">
            <span className="min-w-0 flex-1 truncate text-xs">{item.title} · {item.model}</span>
            {item.active?<span className="text-xs text-emerald-700">使用中</span>:
              <button type="button" disabled={busy} className="text-xs underline" onClick={()=>{void activate(item.id);}}>启用</button>}
            <button type="button" aria-label={"删除 "+item.title} disabled={busy}
              onClick={()=>{void remove(item.id);}} className="text-xs text-red-700">删除</button>
          </div>)}
        </div>
      </section>:null}
      <div className="space-y-3">
        <label className="block text-xs font-medium">修改范围
          <select aria-label="AI 修改范围" value={mode} onChange={e=>setMode(e.target.value as "page"|"block")}
            className="mt-1 w-full rounded border px-3 py-2 text-sm">
            <option value="page">生成 / 优化整个页面</option>
            <option value="block">只修改指定模块</option>
          </select>
        </label>
        {mode==="block"?<label className="block text-xs font-medium">选择模块
          <select aria-label="AI 目标模块" value={selectedId} onChange={e=>setSelectedId(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 text-sm">
            <option value="">请选择模块</option>
            {blocks.map(b=><option key={b.props.id} value={b.props.id}>{b.type} · {b.props.heading||b.props.id}</option>)}
          </select>
        </label>:null}
        <div className="max-h-48 space-y-2 overflow-y-auto">
          {history.map((item,index)=><p key={index} className={"rounded-lg px-3 py-2 text-xs "+
            (item.role==="user"?"bg-stone-900 text-white":"bg-stone-100 text-stone-800")}>{item.content}</p>)}
        </div>
        <label className="block text-xs font-medium">对话设计要求
          <textarea aria-label="AI 设计要求" rows={4} maxLength={1200} value={prompt}
            onChange={e=>setPrompt(e.target.value)}
            placeholder={mode==="block"?"例如：把这个模块改得更适合欧美移动端":"例如：生成一个极简珠宝首页，突出礼品和品牌故事"}
            className="mt-1 w-full resize-y rounded border px-3 py-2 text-sm"/>
        </label>
        <button type="button" disabled={!ready||!active||busy} onClick={()=>{void generate();}}
          className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-40">
          {busy?"AI 正在设计…":"生成并更新中间预览"}
        </button>
        {undo?<button type="button" disabled={busy} onClick={()=>{
          const current=getDocument();
          if(onApply(undo,current)){setUndo(null);setMessage("已恢复本次 AI 修改前的页面预览。");}
        }} className="w-full rounded border px-3 py-2 text-xs">撤回本次 AI 预览</button>:null}
        {message?<p role="status" className="rounded-lg bg-stone-100 px-3 py-2 text-xs">{message}</p>:null}
        <p className="text-xs text-stone-500">满意后使用编辑器的「保存草稿」或「我的模板」；只有点击「发布上线」才会影响网站。</p>
      </div>
    </div>
  </aside>;
}
