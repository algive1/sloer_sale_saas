import "server-only";
import { NextResponse } from "next/server";
import { getBrandSites } from "@/config/brand-sites";
import { currentOpsViewer } from "./current-viewer.server";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";
import { readRealtimeAnalytics } from "@/plugins/analytics/realtime-report";

export async function realtimeResponse(siteId?: string) {
  const viewer = await currentOpsViewer();
  if (!viewer || (siteId === undefined ? viewer.role !== "platform_admin" : viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const site = siteId === undefined ? null : getBrandSites()?.find(site => site.id === siteId);
  if (siteId !== undefined && !site) return NextResponse.json({ error: "unknown_brand" }, { status: 404 });
  if (!analyticsDatabaseConfigured()) return NextResponse.json({ error: "analytics_not_configured" }, { status: 503 });
  try {
    return NextResponse.json(await readRealtimeAnalytics(new Date(), site?.channels ?? null), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "realtime_report_failed" }, { status: 503 });
  }
}
