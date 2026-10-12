import { NextResponse } from "next/server";
import { currentOpsViewer } from "@/lib/ops/current-viewer.server";
import { exportShippingCsv, fulfillmentScope, readFulfillmentSnapshot } from "@/lib/ops/fulfillment";
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
type Context = { params: Promise<{ siteId: string }> };
async function limitedBody(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; let text = "";
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) return text + decoder.decode(); bytes += chunk.value.byteLength; if (bytes > 12_000) { await reader.cancel(); throw new Error("request_too_large"); } text += decoder.decode(chunk.value, { stream: true }); }
  } finally { reader.releaseLock(); }
}
function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const status = code === "request_too_large" ? 413 : /forbidden|individual_admin/.test(code) ? 403 : code.startsWith("unknown_") ? 404 : code.startsWith("invalid_") ? 400 : /changed_reload|address_incomplete|sku_incomplete|too_many_lines/.test(code) ? 409 : 503;
  const safeCode = ["export_orders_changed_reload", "export_address_incomplete", "export_sku_incomplete", "export_too_many_lines_use_smaller_batch", "export_audit_storage_required"].includes(code) ? code : status === 503 ? "fulfillment_service_unavailable" : status === 403 ? "forbidden" : "invalid_brand_market_or_selection";
  return NextResponse.json({ error: safeCode }, { status, headers: noStore });
}
export async function GET(request: Request, { params }: Context) {
  const [{ siteId }, viewer] = await Promise.all([params, currentOpsViewer()]);
  const query = new URL(request.url).searchParams;
  try { return NextResponse.json(await readFulfillmentSnapshot(siteId, viewer, query.get("channel") ?? undefined, query.get("after") ?? undefined), { headers: noStore }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  const [{ siteId }, viewer] = await Promise.all([params, currentOpsViewer()]);
  if (viewer?.role !== "platform_admin" || viewer.username === "analytics") return failure(new Error("individual_admin_required"));
  let sameOrigin = false;
  try { sameOrigin = new URL(request.headers.get("origin") ?? "").host === request.headers.get("host"); } catch { /* reject */ }
  if (!sameOrigin || request.headers.get("x-requested-with") !== "shipping-export" || request.headers.get("sec-fetch-site") === "cross-site") return failure(new Error("forbidden"));
  if (Number(request.headers.get("content-length") ?? 0) > 12_000) return NextResponse.json({ error: "request_too_large" }, { status: 413, headers: noStore });
  try {
    const raw = await limitedBody(request);
    const body = JSON.parse(raw) as { channel?: unknown; orderIds?: unknown; confirm?: unknown };
    if (!body || body.confirm !== true || typeof body.channel !== "string") throw new Error("invalid_export_confirmation");
    const { site, channel } = fulfillmentScope(siteId, viewer, body.channel);
    const output = await exportShippingCsv(siteId, viewer, channel, body.orderIds);
    return new Response(output.csv, { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${site.id}-${channel}-shipping.csv"`, "X-Shipping-Export-Id": output.exportId, "X-Shipping-Export-Rows": String(output.rows) } });
  } catch (error) { return failure(error instanceof SyntaxError ? new Error("invalid_export_json") : error); }
}
