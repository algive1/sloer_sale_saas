"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const entries = [
  {label:"数据总览", href:"/ops/analytics", glyph:"▦"},
  {label:"实时数据", href:"/ops/analytics/realtime", glyph:"◉"},
  {label:"流量分析", href:"/ops/analytics/traffic", glyph:"⌁"},
  {label:"结账分析", href:"/ops/analytics/checkout", glyph:"◇"},
  {label:"商品分析", href:"/ops/analytics/products", glyph:"▧"},
  {label:"店铺装修", href:"/ops/themes", glyph:"▤"},
] as const;

export function AnalyticsNavigation() {
  const pathname=usePathname();
  return <aside className="sticky top-0 z-10 flex h-auto flex-col bg-[#111315] text-white lg:h-screen lg:min-h-screen">
    <div className="hidden items-center gap-3 border-b border-white/10 px-5 py-6 lg:flex">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-base font-bold text-[#111315]">Y</span>
      <div><p className="text-sm font-bold">悦动之心</p><p className="mt-0.5 text-xs text-white/50">Commerce Analytics</p></div>
    </div>
    <p className="hidden px-6 pb-2 pt-7 text-[11px] font-semibold uppercase tracking-widest text-white/45 lg:block">Analytics</p>
    <nav aria-label="数据分析导航" className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:px-4 lg:py-0">
      {entries.map(item=>{
        const active=pathname===item.href;
        return <Link key={item.href} href={item.href} aria-current={active?"page":undefined}
          className={"flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors "+(active?"bg-white/15 font-semibold text-white":"text-white/70 hover:bg-white/10 hover:text-white")}>
          <span aria-hidden="true" className="w-4 text-center">{item.glyph}</span><span>{item.label}</span>
        </Link>;
      })}
    </nav>
    <div className="mt-auto hidden border-t border-white/10 px-6 py-5 text-xs leading-5 text-white/55 lg:block">
      所有经营报表以已采集数据为准。<br/>具体金额按原币种统计。
    </div>
  </aside>;
}
