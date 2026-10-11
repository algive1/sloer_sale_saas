import { parseCatalogCsv, csvFile } from "@/lib/ops/catalog-csv";

export const TRACKING_CSV_COLUMNS = ["order_id", "fulfillment_id", "tracking_number"] as const;
export const TRACKING_MAX_ROWS = 10;
export type TrackingInput = { row: number; orderId: string; fulfillmentId: string; trackingNumber: string };
export type TrackingCheck = TrackingInput & { orderNumber: string | null; status: "ready" | "already_applied" | "missing" | "ineligible" | "conflict" };
export type TrackingResult = TrackingInput & { status: "applied" | "already_applied" | "rejected" | "uncertain" | "conflict"; reason: string; attemptId: string | null };
export type TrackingPreview = { id: string; expiresAt: string; canSubmit: boolean; rows: TrackingCheck[] };

export function parseTrackingCsv(text: string): TrackingInput[] {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > 64_000) throw new Error("invalid_tracking_csv");
  let rows;
  try { rows = parseCatalogCsv(text); } catch { throw new Error("invalid_tracking_csv"); }
  if (rows.shift()?.join(",") !== TRACKING_CSV_COLUMNS.join(",") || !rows.length || rows.length > TRACKING_MAX_ROWS) throw new Error("invalid_tracking_csv");
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const [orderId = "", fulfillmentId = "", trackingNumber = ""] = cells.map(cell => cell.trim());
    if (cells.length !== 3 || !nativeId(orderId, "Order") || !nativeId(fulfillmentId, "Fulfillment") ||
      !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(trackingNumber) || seen.has(fulfillmentId)) throw new Error("invalid_tracking_csv");
    seen.add(fulfillmentId);
    return { row: index + 2, orderId, fulfillmentId, trackingNumber };
  });
}
function nativeId(value: string, kind: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 300) return false;
  try { const decoded = atob(value); return btoa(decoded) === value && new RegExp(`^${kind}:[A-Za-z0-9_-]+$`).test(decoded); } catch { return false; }
}
export function trackingTemplate(rows: readonly Pick<TrackingInput, "orderId" | "fulfillmentId">[] = []): string {
  return csvFile([TRACKING_CSV_COLUMNS, ...rows.map(row => [row.orderId, row.fulfillmentId, ""])]);
}
export function trackingResultsCsv(rows: readonly TrackingResult[]): string {
  return csvFile([["row", ...TRACKING_CSV_COLUMNS, "status", "reason", "attempt_id"], ...rows.map(row => [row.row, row.orderId, row.fulfillmentId, row.trackingNumber, row.status, row.reason, row.attemptId ?? ""])]);
}
export const TRACKING_STATUS_LABELS: Record<TrackingCheck["status"] | TrackingResult["status"], string> = {
  ready: "待回填", already_applied: "原生单号一致", missing: "订单或履约不存在", ineligible: "付款、订单或履约状态不符合", conflict: "单号冲突，请原生后台核对", applied: "原生回填已确认", rejected: "未执行或原生拒绝", uncertain: "结果待核对，禁止自动重发",
};
export const TRACKING_REASON_LABELS: Record<string, string> = {
  native_confirmed: "已收到原生回填确认", native_already_matches: "原生单号已一致，没有重复回填", native_reconciled: "已重读原生记录并核对，没有重复回填",
  source_check_failed: "提交前无法读取原生状态，未发送回填", native_changed: "提交前原生状态发生变化，未发送回填", native_rejected: "原生接口拒绝，请核对履约权限或状态",
  receipt_requires_native_review: "回执未能确认，请打开原生后台核对", audit_or_source_requires_review: "审计或来源不可用，请核对原生记录和历史",
  claim_requires_native_review: "此前结果待核对，已阻止重复发送", different_active_claim: "存在其他回填记录，请核对历史和原生单号", batch_stopped_before_attempt: "前一笔结果待核对，本行尚未尝试",
};
