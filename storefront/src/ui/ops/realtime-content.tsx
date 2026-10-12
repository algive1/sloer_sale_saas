import { PluginPauseNotice } from "@/plugins/system/pause-notice.server";
import { io } from "next/cache";
import { getBrandSites } from "@/config/brand-sites";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";
import { readRealtimeAnalytics } from "@/plugins/analytics/realtime-report";
import { RealtimeDashboard } from "@/app/ops/analytics/realtime/realtime-dashboard";

export async function RealtimeContent({ siteId }: { siteId?: string }) {
  await io();
  const viewer = await currentOpsViewer();
  if (!viewer || (siteId === undefined ? viewer.role !== "platform_admin" : viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) return <p className="p-8" role="alert">无权查看此范围。</p>;
  const site = siteId === undefined ? null : getBrandSites()?.find(site => site.id === siteId);
  if (siteId !== undefined && !site) return <p className="p-8" role="alert">品牌不存在。</p>;
  if (!analyticsDatabaseConfigured()) return <p className="p-8" role="alert">统计数据库未配置，无法读取实时数据。</p>;
  let data;
  try { data = await readRealtimeAnalytics(new Date(), site?.channels ?? null); }
  catch { return <p className="p-8" role="alert">实时数据暂时不可用，请稍后重试。</p>; }
  return <><PluginPauseNotice plugin="analytics"/><RealtimeDashboard initialData={data} scopeLabel={site ? `${site.name} · ${site.channels.join("、")}` : "全品牌汇总"}
    endpoint={site ? `/ops/sites/${encodeURIComponent(site.id)}/realtime/api` : "/ops/api/analytics/realtime"} /></>;
}
