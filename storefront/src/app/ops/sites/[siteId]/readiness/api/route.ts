import { type NextRequest, NextResponse } from "next/server";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { readinessActorAllowed } from "@/lib/ops/readiness-model";
import { brandReadiness, verifyBrandReadiness } from "@/lib/ops/readiness-service";
import { ReadinessConflictError } from "@/lib/ops/readiness-store";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const viewer = await currentOpsViewer();
  const { siteId } = await params;
  if (!viewer || (viewer.role !== "platform_admin" && !viewer.siteIds.includes(siteId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { return NextResponse.json({ snapshot: await brandReadiness(siteId) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "unknown_brand_or_unavailable" }, { status: 404 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const viewer = await currentOpsViewer();
  if (!readinessActorAllowed(viewer)) return NextResponse.json({ error: "individual_admin_required" }, { status: 403 });
  let sameOrigin = false;
  try { sameOrigin = new URL(request.headers.get("origin") ?? "").host === request.headers.get("host"); } catch { /* Invalid or absent origin. */ }
  if (!sameOrigin || request.headers.get("x-requested-with") !== "readiness" || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 12_000) return NextResponse.json({ error: "record_too_large" }, { status: 413 });
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > 12_000) return NextResponse.json({ error: "record_too_large" }, { status: 413 });
    input = JSON.parse(text);
  } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  try {
    const { siteId } = await params;
    return NextResponse.json({ snapshot: await verifyBrandReadiness(siteId, input, viewer) });
  } catch (error) {
    const conflict = error instanceof ReadinessConflictError;
    return NextResponse.json({ error: conflict ? "readiness_changed_reload_required" : "readiness_unavailable_or_invalid_record" }, { status: conflict ? 409 : 400 });
  }
}
