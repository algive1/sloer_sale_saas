"use client";
import { useEffect, useState } from "react";

type Item={slug:string;name:string;image:string|null;price:{amount:number;currency:string}|null};
export function ProductCanvasPreview({channel,slug,heading}:{channel:string;slug:string;heading:string}) {
  const [item,setItem]=useState<Item|null>(null);
  useEffect(()=>{
    if(!slug||!channel)return;
    const controller=new AbortController();
    fetch("/ops/themes/catalog?"+new URLSearchParams({kind:"product",channel,slug}),{
      signal:controller.signal,cache:"no-store",
    }).then(async r=>r.ok?await r.json() as {item:Item|null}:null)
      .then(data=>{if(!controller.signal.aborted)setItem(data?.item??null);})
      .catch(()=>{if(!controller.signal.aborted)setItem(null);});
    return()=>controller.abort();
  },[channel,slug]);
  const selected=item?.slug===slug?item:null;
  const price=selected?.price;
  const formatted=price?new Intl.NumberFormat("en",{style:"currency",currency:price.currency}).format(price.amount):"";
  return <section className="mx-auto max-w-5xl px-6 py-16">
    <h2 className="mb-8 text-3xl text-stone-900">{heading}</h2>
    <div className="grid gap-8 md:grid-cols-2">
      <div className="aspect-[4/5] bg-stone-100 bg-cover bg-center"
        style={selected?.image?{backgroundImage:"url("+JSON.stringify(selected.image)+")"}:undefined}/>
      <div className="flex flex-col justify-center gap-4">
        <p className="text-2xl font-medium">{selected?.name??(slug?"正在读取商品…":"从右侧选择真实商品")}</p>
        <p className="text-xl">{formatted}</p>
        <span className="w-fit bg-stone-900 px-8 py-3 text-sm text-white">查看商品详情</span>
      </div>
    </div>
  </section>;
}
