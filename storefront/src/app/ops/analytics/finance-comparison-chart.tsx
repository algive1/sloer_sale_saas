"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { OverviewFinance } from "@/lib/analytics/overview-details";

const WIDTH = 760, HEIGHT = 245, LEFT = 46, RIGHT = 16, TOP = 12, BOTTOM = 29;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;
const number = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 2 });

export function FinanceComparisonChart({
  rows, country, currency, bucket,
}:{
  rows: OverviewFinance[];
  country: string;
  currency: string;
  bucket: "hour"|"day";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number|null>(null);
  const [pinned, setPinned] = useState<number|null>(null);
  const [showCountry, setShowCountry] = useState(true);
  const all = useMemo(()=>{
    const map=new Map<string,{time:string;all:number;region:number}>();
    for (const row of rows) {
      if(row.currency!==currency || (row.country!=="ALL" && row.country!==country))continue;
      const item=map.get(row.bucket)??{time:row.bucket,all:0,region:0};
      const value=row.gross-row.refunds;
      if(row.country==="ALL")item.all+=value;
      else if(row.country===country)item.region+=value;
      map.set(row.bucket,item);
    }
    return [...map.values()].sort((a,b)=>a.time.localeCompare(b.time));
  },[rows,country,currency]);
  const max=Math.max(1,...all.map(p=>Math.max(p.all,country==="ALL"?0:p.region)));
  const min=Math.min(0,...all.map(p=>Math.min(p.all,country==="ALL"?0:p.region)));
  const denominator=max-min||1;
  const x=(i:number)=>LEFT+(all.length<=1?PLOT_W/2:i*PLOT_W/(all.length-1));
  const y=(v:number)=>TOP+(max-v)/denominator*PLOT_H;
  const path=(key:"all"|"region")=>all.map((p,i)=>(i===0?"M":"L")+x(i).toFixed(2)+","+y(p[key]).toFixed(2)).join(" ");
  const pointerIndex=(event:PointerEvent<HTMLDivElement>)=>{
    const bounds=ref.current?.getBoundingClientRect();
    if (!bounds||!all.length)return null;
    const xx=(event.clientX-bounds.left)*WIDTH/bounds.width;
    return Math.max(0,Math.min(all.length-1,Math.round((xx-LEFT)/PLOT_W*(all.length-1))));
  };
  const active=pinned??hover, point=active===null?null:all[active];
  const tickIndices=[...new Set([0,Math.floor((all.length-1)/2),all.length-1])];
  if(!currency||!all.length) return <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">暂无该币种的成交趋势</div>;
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-foreground"/>全站</span>
      {country!=="ALL"&&<button type="button" aria-pressed={showCountry} onClick={()=>setShowCountry(v=>!v)} className={"flex items-center gap-1.5 rounded border border-border px-2 py-1 "+(showCountry?"":"opacity-50")}>
        <span className="h-2 w-4 rounded bg-slate-400"/>{country}（点击显示/隐藏）
      </button>}
      <span className="ml-auto text-[11px]">单位：{currency} · {bucket==="hour"?"小时":"日"}</span>
    </div>
    <div ref={ref} className="relative touch-pan-y" onPointerMove={e=>{if(pinned===null)setHover(pointerIndex(e));}} onPointerLeave={()=>setHover(null)} onPointerDown={e=>{const idx=pointerIndex(e);if(idx!==null){setPinned(v=>v===idx?null:idx);setHover(idx);}}} aria-label="全站与选中地区成交趋势，指向数据点可查看数值，点击可固定">
      <svg viewBox={"0 0 "+WIDTH+" "+HEIGHT} className="h-[245px] w-full" role="img">
        <title>全站与选中地区净成交趋势</title>
        {[0,1,2,3,4].map(i=>{
          const value=max-(max-min)*i/4, yy=y(value);
          return <g key={i}><line x1={LEFT} y1={yy} x2={WIDTH-RIGHT} y2={yy} stroke="currentColor" opacity=".1"/><text x={LEFT-7} y={yy+3} textAnchor="end" fontSize="10" fill="currentColor" opacity=".55">{number(value)}</text></g>;
        })}
        {tickIndices.map(i=><text key={i} x={x(i)} y={HEIGHT-6} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".6">{all[i]?.time?.slice(5)??""}</text>)}
        <path d={path("all")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        {country!=="ALL"&&showCountry&&<path d={path("region")} fill="none" stroke="#89929e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
        {active!==null&&point&&<g>
          <line x1={x(active)} x2={x(active)} y1={TOP} y2={TOP+PLOT_H} stroke="currentColor" opacity=".35" strokeDasharray="4 4"/>
          <circle cx={x(active)} cy={y(point.all)} r="4" fill="white" stroke="#333840" strokeWidth="2"/>
          {country!=="ALL"&&showCountry&&<circle cx={x(active)} cy={y(point.region)} r="4" fill="white" stroke="#89929e" strokeWidth="2"/>}
        </g>}
      </svg>
      {point&&<div className="pointer-events-none absolute top-1 rounded-lg border border-border bg-card p-3 text-xs shadow-lg" style={{left:(Math.min(78,Math.max(5,100*x(active!)/WIDTH)))+"%"}}>
        <b>{point.time}</b><p className="mt-1">全站：{number(point.all)} {currency}</p>
        {country!=="ALL"&&showCountry&&<p>{country}：{number(point.region)} {currency}</p>}
        <p className="mt-1 text-[10px] text-muted-foreground">{pinned===null?"点击固定数据":"再次点击解除固定"}</p>
      </div>}
    </div>
  </div>;
}
