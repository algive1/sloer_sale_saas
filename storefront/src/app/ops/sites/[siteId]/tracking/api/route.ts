import { NextResponse } from "next/server";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { commitTrackingCsv, previewTrackingCsv, readTrackingQueue, trackingHistory } from "@/lib/ops/tracking";
export const maxDuration = 180;
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
type Context = { params: Promise<{ siteId: string }> };
async function limitedBody(request: Request) {
  if (!request.body) throw new Error("invalid_tracking_request");
  const reader = request.body.getReader(); const decoder = new TextDecoder("utf-8", { fatal: true }); let bytes = 0; let text = "";
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) return text + decoder.decode(); bytes += chunk.value.byteLength; if (bytes > 70_000) { await reader.cancel(); throw new Error("request_too_large"); } text += decoder.decode(chunk.value, { stream: true }); }
  } finally { reader.releaseLock(); }
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = code === "request_too_large" ? 413 : /forbidden|individual_admin/.test(code) ? 403 : code.startsWith("unknown_") ? 404 : code.startsWith("invalid_") ? 400 : /expired_or_changed|changed_reload/.test(code) ? 409 : 503;
  const safe = ["invalid_tracking_csv", "tracking_preview_expired_or_changed", "tracking_orders_changed_reload", "tracking_audit_required", "tracking_credential_required"].includes(code) ? code : status === 503 ? "tracking_service_unavailable" : status === 403 ? "forbidden" : "invalid_tracking_request";
  return NextResponse.json({ error: safe }, { status, headers: noStore });
}
export async function GET(request: Request, { params }: Context) {
  const [{ siteId }, viewer] = await Promise.all([params, currentOpsViewer()]);
  const query = new URL(request.url).searchParams;
  try {
    const [queue, history] = await Promise.all([readTrackingQueue(siteId, viewer, query.get("channel") ?? undefined, query.get("after") ?? undefined), trackingHistory(siteId, viewer, query.get("channel") ?? undefined)]);
    return NextResponse.json({ queue, history }, { headers: noStore });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  const [{ siteId }, viewer] = await Promise.all([params, currentOpsViewer()]);
  if (viewer?.role !== "platform_admin" || viewer.username === "analytics") return failure(new Error("individual_admin_required"));
  let sameOrigin = false;
  try { sameOrigin = new URL(request.headers.get("origin") ?? "").host === request.headers.get("host"); } catch { /* reject */ }
  if (!sameOrigin || request.headers.get("x-requested-with") !== "tracking-import" || request.headers.get("sec-fetch-site") === "cross-site") return failure(new Error("forbidden"));
  if (Number(request.headers.get("content-length") ?? 0) > 70_000) return failure(new Error("request_too_large"));
  try {
    let body: { channel?: unknown; csv?: unknown; action?: unknown; previewId?: unknown; confirm?: unknown };
    try { body = JSON.parse(await limitedBody(request)) as typeof body; } catch (error) { if (error instanceof Error && error.message === "request_too_large") throw error; throw new Error("invalid_tracking_request"); }
    if (!body || typeof body.channel !== "string" || typeof body.csv !== "string") throw new Error("invalid_tracking_request");
    if (body.action === "preview") return NextResponse.json(await previewTrackingCsv(siteId, viewer, body.channel, body.csv), { headers: noStore });
    if (body.action !== "commit" || body.confirm !== true || typeof body.previewId !== "string") throw new Error("invalid_tracking_confirmation");
    return NextResponse.json(await commitTrackingCsv(siteId, viewer, body.channel, body.csv, body.previewId), { headers: noStore });
  } catch (error) { return failure(error); }
}
