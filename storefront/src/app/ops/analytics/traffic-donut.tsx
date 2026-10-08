"use client";
import { useState } from "react";
const COLORS=["#16a34a","#7c3aed","#2563eb","#f59e0b","#94a3b8"];
const NAMES=["自然搜索","付费广告","Direct","推荐 / 社媒","其他"];
export function TrafficDonut({values,selected,onSelect}:{
 values:number[];selected:number|null;onSelect:(index:number|null)=>void;
}){
 const [focus,setFocus]=useState<number|null>(null);
 const total=values.reduce((a,b)=>a+b,0);
 const r=43,c=2*Math.PI*r;
 let offset=0;
 const active=selected??focus;
 return <div className="relative mx-auto h-[126px] w-[126px] shrink-0">
  <svg viewBox="0 0 120 120" className="h-full w-full" aria-label="按来源划分流量，点击扇区高亮">
    <circle cx="60" cy="60" r={r} stroke="#e5e7eb" strokeWidth="17" fill="none"/>
    {values.map((value,i)=>{
      const length=total?value/total*c:0;const start=offset;offset+=length;
      return <circle key={i} role="button" tabIndex={0}
       aria-label={NAMES[i]+": "+(total?(100*value/total).toFixed(1)+"%":"无数据")}
       onClick={()=>onSelect(selected===i?null:i)}
       onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(selected===i?null:i);}}}
       onMouseEnter={()=>setFocus(i)} onMouseLeave={()=>setFocus(null)}
       cx="60" cy="60" r={r} fill="none" stroke={COLORS[i]} strokeWidth={active===i?22:17}
       strokeDasharray={length+" "+(c-length)} strokeDashoffset={-start}
       transform="rotate(-90 60 60)" className="cursor-pointer transition-[stroke-width,opacity] duration-150"
       opacity={active===null||active===i?1:.35}><title>{NAMES[i]}</title></circle>;
    })}
    <text x="60" y="57" textAnchor="middle" className="fill-current" fontSize="17" fontWeight="700">{total?(active===null?total.toLocaleString():(100*values[active]/total).toFixed(1)+"%"):"—"}</text>
    <text x="60" y="73" textAnchor="middle" className="fill-current" fontSize="9">{active===null?"总会话":NAMES[active]}</text>
  </svg>
 </div>;
}
export const TRAFFIC_COLORS=COLORS;