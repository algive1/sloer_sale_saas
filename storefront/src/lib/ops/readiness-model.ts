import type { BrandSite } from "@/config/brand-sites";
import type { OpsViewer } from "./authorization";

export type ReadinessStatus = "passed" | "failed" | "pending" | "stale" | "unavailable";
export type ReadinessRecord = {
  checkId: string; revision: number; contextHash: string; result: "passed" | "failed";
  verifiedBy: string; verifiedAt: string; expiresAt: string; evidence: string;
  environment: "production" | "test";
};
export type ReadinessCheck = {
  id: string; label: string; details: string; fixHref: string;
  kind: "automatic" | "manual"; required: boolean; status: ReadinessStatus;
  record?: ReadinessRecord;
};
export type ReadinessSnapshot = {
  siteId: string; siteName: string; contextHash: string; checkedAt: string;
  storageAvailable: boolean; checks: ReadinessCheck[]; canLaunch: boolean;
};

export function manualReadinessChecks(site: BrandSite): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const add = (id: string, label: string, details: string, fixHref = `/ops/sites/${encodeURIComponent(site.id)}`) =>
    checks.push({ id, label, details, fixHref, kind: "manual", required: true, status: "pending" });
  for (const domain of site.domains) add(`domain:${domain}`, `${domain} · DNS / HTTPS`,
    "从公网确认 DNS、证书与品牌页面；记录测试日期、工具和证据编号。不能用登记域名代替实测。", `https://${domain}`);
  for (const channel of site.channels) {
    add(`catalog:${channel}`, `${channel} · 商品、库存与币种`, "用真实在售商品检查规格、库存、图片、币种和市场价格；注明测试商品编号。", "/ops/translations");
    add(`shipping:${channel}`, `${channel} · 目标国家配送`, "记录目标国家/邮编、配送方式、费用与预计时效；同时验证不可配送地址的错误提示。");
    add(`payment:${channel}`, `${channel} · 支付与恢复`, "注明网关及沙盒/正式环境；验证成功、失败、3DS、关闭页面恢复和重复回调。上线前必须验证正式结算资格。");
    add(`refund:${channel}`, `${channel} · 退款与对账`, "验证退款、部分退款、重复请求、失败后核对，并记录供应商交易/验收记录的脱敏编号。");
    add(`fulfillment:${channel}`, `${channel} · 发货与查单`, "验证部分发货、物流单号、状态通知，以及顾客验证身份后的本品牌查单。");
  }
  add("policies", "政策与联系方式", "所有已开放语言的隐私、条款、配送、退货和联系页面均可访问且与实际业务一致；记录页面路径和抽检语言。");
  add("email", "品牌邮件身份与投递", "实测订单/发货/退款与启用的催付邮件，核对发件身份、语言和链接；记录脱敏验收编号。", "/ops/analytics/reminders");
  add("support", "客服渠道与转人工", "验证启用的品牌客服渠道、身份验证、人工接管、用户同意；未启用的渠道也应明确说明。", "/ops/support");
  add("privacy", "品牌、权限与跟踪边界", "验证跨品牌订单/购物车/员工权限负例、拒绝营销跟踪、删除/导出流程；记录测试范围和广告接收端检查。", "/ops/plugins");
  return checks;
}

export function recordStatus(record: ReadinessRecord | undefined, contextHash: string, now: number): ReadinessStatus {
  if (!record) return "pending";
  if (record.contextHash !== contextHash || !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now) return "stale";
  return record.result === "passed" && record.environment !== "production" ? "pending" : record.result;
}

export function readinessActorAllowed(viewer: OpsViewer | null): boolean {
  // A shared Basic account cannot provide individual verification ownership.
  return viewer?.role === "platform_admin" && viewer.username !== "analytics";
}

export function launchAllowed(checks: readonly ReadinessCheck[], storageAvailable: boolean): boolean {
  return storageAvailable && checks.length > 0 && checks.every(check => !check.required || check.status === "passed");
}
