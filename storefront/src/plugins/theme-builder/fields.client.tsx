"use client";

import { useEffect, useState } from "react";

type Item={slug:string;name:string;image:string|null;price?:{amount:number;currency:string}|null};
type Binding={value?:string;onChange:(value:string)=>void;readOnly?:boolean};
type CatalogKind="products"|"collections";

function Picker({kind,channel,value,onChange,readOnly}:Binding&{kind:CatalogKind;channel:string}) {
  const [search,setSearch]=useState("");
  const [items,setItems]=useState<Item[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!channel)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setBusy(true);setError("");
      fetch("/ops/themes/catalog?"+new URLSearchParams({kind,channel,q:search}),{
        signal:controller.signal,cache:"no-store",
      }).then(async(response)=>{
        const data=await response.json() as {items?:Item[];error?:string};
        if(!response.ok)throw new Error(data.error??"商品目录获取失败");
        return data.items??[];
      }).then(options=>{if(!controller.signal.aborted)setItems(options);})
        .catch((reason:unknown)=>{
          if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"商品目录获取失败");
        }).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    },220);
    return()=>{clearTimeout(timer);controller.abort();};
  },[channel,kind,search]);
  return <div className="space-y-2">
    <label className="block text-xs font-medium text-stone-700">{kind==="products"?"关联商品":"商品集合"}</label>
    {value?<p className="rounded bg-stone-50 px-2 py-1 text-xs text-stone-700">已选：{value}</p>:null}
    <input aria-label={kind==="products"?"搜索商品":"搜索商品集合"}
      className="w-full rounded border border-stone-200 px-2 py-2 text-sm"
      placeholder={kind==="products"?"搜索商品名称":"搜索集合名称"}
      value={search} disabled={readOnly} onChange={e=>setSearch(e.target.value)}/>
    {busy?<p className="text-xs text-stone-500">正在搜索…</p>:null}
    {error?<p role="alert" className="text-xs text-red-700">{error}</p>:null}
    <div className="max-h-52 space-y-1 overflow-y-auto">
      {items.map(item=><button type="button" key={item.slug} disabled={readOnly}
        aria-pressed={value===item.slug} onClick={()=>onChange(item.slug)}
        className={"flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs hover:bg-stone-100 "+
          (value===item.slug?"border-stone-900 bg-stone-100":"border-stone-200")}>
        <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded bg-stone-100 bg-cover bg-center"
          style={item.image?.startsWith("https://")?{backgroundImage:"url("+JSON.stringify(item.image)+")"}:undefined}/>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block truncate text-stone-500">{item.slug}</span>
        </span>
      </button>)}
      {!busy&&!items.length&&!error?<p className="text-xs text-stone-500">无匹配结果</p>:null}
    </div>
  </div>;
}

function ImagePicker({channel,value,onChange,readOnly}:Binding&{channel:string}) {
  const [items,setItems]=useState<Item[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/ops/themes/catalog?"+new URLSearchParams({kind:"products",channel,q:""}),{
      signal:controller.signal,cache:"no-store",
    }).then(async r=>r.ok?await r.json() as {items?:Item[]}:null)
      .then(data=>{if(!controller.signal.aborted)setItems((data?.items??[]).filter(item=>item.image));})
      .catch(()=>{});
    return()=>controller.abort();
  },[channel]);
  async function upload(file:File) {
    if(file.size>5*1024*1024){setError("图片大小不能超过 5 MB");return;}
    setError("");setBusy(true);
    try{
      const body=new FormData();body.append("file",file);
      const response=await fetch("/ops/themes/upload?"+new URLSearchParams({channel}),{
        method:"POST",body,credentials:"same-origin",
      });
      const result=await response.json() as {url?:string;error?:string};
      if(!response.ok||!result.url)throw new Error(result.error??"上传失败");
      onChange(result.url);
    }catch(reason){setError(reason instanceof Error?reason.message:"上传失败");}
    finally{setBusy(false);}
  }
  return <div className="space-y-2">
    <label className="block text-xs font-medium text-stone-700">图片素材</label>
    {value?<div role="img" aria-label="当前图片" className="h-32 rounded bg-stone-100 bg-cover bg-center"
      style={{backgroundImage:"url("+JSON.stringify(value)+")"}}/>:null}
    <label className="block cursor-pointer rounded border border-stone-200 px-3 py-2 text-center text-xs">
      {busy?"正在上传…":"上传 JPG / PNG / WebP（最大 5 MB）"}
      <input className="sr-only" type="file" accept=".jpeg,.jpg,.png,.webp" disabled={readOnly||busy}
        onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}}/>
    </label>
    <p className="text-xs text-stone-500">或选择当前市场已有的商品图片</p>
    <div className="grid max-h-32 grid-cols-4 gap-1 overflow-y-auto">
      {items.slice(0,24).map(item=><button type="button" key={item.slug} disabled={readOnly}
        title={item.name} aria-label={"使用 "+item.name+" 的图片"}
        className="aspect-square rounded border border-stone-200 bg-stone-100 bg-cover bg-center hover:ring-2"
        style={{backgroundImage:"url("+JSON.stringify(item.image)+")"}}
        onClick={()=>{if(item.image)onChange(item.image);}}/>)}
    </div>
    <details><summary className="cursor-pointer text-xs text-stone-500">使用已有 HTTPS 图片地址</summary>
      <input aria-label="图片链接" className="mt-2 w-full rounded border border-stone-200 p-2 text-xs"
        disabled={readOnly} placeholder="https://..." value={value??""}
        onChange={e=>onChange(e.target.value)}/>
    </details>
    {error?<p role="alert" className="text-xs text-red-700">{error}</p>:null}
    {value?<button type="button" disabled={readOnly} className="text-xs underline" onClick={()=>onChange("")}>移除图片</button>:null}
  </div>;
}

export function collectionField(channel:string) {
  return {type:"custom" as const,label:"选择商品集合",
    render:({value,onChange,readOnly}:Binding)=><Picker kind="collections" channel={channel}
      value={value} onChange={onChange} readOnly={readOnly}/>};
}
export function productField(channel:string) {
  return {type:"custom" as const,label:"选择商品",
    render:({value,onChange,readOnly}:Binding)=><Picker kind="products" channel={channel}
      value={value} onChange={onChange} readOnly={readOnly}/>};
}
export function imageField(channel:string) {
  return {type:"custom" as const,label:"选择图片",
    render:({value,onChange,readOnly}:Binding)=><ImagePicker channel={channel} value={value}
      onChange={onChange} readOnly={readOnly}/>};
}
