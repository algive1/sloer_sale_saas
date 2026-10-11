import "server-only";
import { createHash } from "node:crypto";
import { getBrandSites } from "@/config/brand-sites";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { isAllowedLocaleChannelPair } from "@/config/locale-channel";
import { ChannelsListDocument } from "@/gql/graphql";
import { executeAppGraphQL } from "@/lib/graphql";
import { readTheme, themeDatabaseConfigured } from "@/plugins/theme-builder/store";
import type { OpsViewer } from "./authorization";
import { manualReadinessChecks, launchAllowed, readinessActorAllowed, recordStatus, type ReadinessCheck, type ReadinessSnapshot } from "./readiness-model";
import { appendReadinessRecord, ReadinessConflictError, readinessRecords, readinessStorageConfigured } from "./readiness-store";

const RELEVANT_ENV = /^(?:STOREFRONT_|NEXT_PUBLIC_|SALEOR_SHARED_CORE_|ENABLE_STRIPE|RESEND_API_KEY|PAYMENT_REMINDER_|SUPPORT_|TRANSLATION_PUBLISH_ENABLED|OPS_READINESS_CONFIG_REVISION)/;

export async function brandReadiness(siteId: string): Promise<ReadinessSnapshot> {
  const site = getBrandSites()?.find(entry => entry.id === siteId);
  if (!site) throw new Error("unknown_brand");
  const now = Date.now();
  const channels = getStaticStorefrontChannelSlugs();
  const locales = getStorefrontLocaleSlugs();
  let backend: Array<{ slug: string; isActive: boolean }> | null = null;
  try {
    if (process.env.SALEOR_APP_TOKEN) {
      const response = await executeAppGraphQL(ChannelsListDocument, { cache: "no-store" });
      if (response.ok) backend = response.data.channels?.filter(channel => site.channels.includes(channel.slug))
        .map(channel => ({ slug: channel.slug, isActive: channel.isActive })).sort((a, b) => a.slug.localeCompare(b.slug)) ?? null;
    }
  } catch { /* Unreachable services never become a successful launch check. */ }
  let themeRevision: number | null = null;
  let themeAvailable = !themeDatabaseConfigured();
  if (themeDatabaseConfigured()) {
    try {
      const theme = await readTheme(site.defaultChannel, site.defaultLocale ?? locales[0] ?? "en");
      themeRevision = theme.publishedRevision;
      themeAvailable = true;
    } catch { /* Include unavailability in the gate. */ }
  }
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => RELEVANT_ENV.test(key)).sort(([a], [b]) => a.localeCompare(b)));
  // Credentials participate in invalidation, but only their digest leaves this function.
  const contextHash = createHash("sha256").update(JSON.stringify({ version: 1, site, environment, themeRevision, backend })).digest("hex");
  let storageAvailable = false;
  let records: Awaited<ReturnType<typeof readinessRecords>> = [];
  if (readinessStorageConfigured()) {
    try { records = await readinessRecords(siteId); storageAvailable = true; } catch { /* Fail closed. */ }
  }
  const automatic = (id: string, label: string, status: ReadinessCheck["status"], details: string): ReadinessCheck =>
    ({ id, label, status, details, fixHref: `/ops/sites/${encodeURIComponent(siteId)}`, kind: "automatic", required: true });
  const checks: ReadinessCheck[] = [
    automatic("config", "可信品牌映射与公开市场", site.channels.every(channel => channels.includes(channel)) ? "passed" : "failed", "只核对已验证的部署映射与 Channel 名单；公网可访问性单独验收。"),
    automatic("channels", "Saleor 市场存在且已启用", !backend ? "unavailable" : site.channels.every(channel => backend?.some(entry => entry.slug === channel && entry.isActive)) ? "passed" : "failed", "实时查询 Saleor，不使用报表缓存。未配置凭证、服务不可用或市场停用都会阻断本页验收。"),
    automatic("locales", "每个市场的语言与默认组合", site.channels.every(channel => locales.some(locale => isAllowedLocaleChannelPair(locale, channel))) && isAllowedLocaleChannelPair(site.defaultLocale ?? locales[0] ?? "en", site.defaultChannel) ? "passed" : "failed", "每个市场至少一个开放语言；品牌默认语言/市场也必须可访问。"),
    automatic("theme", "页面发布数据可读取", themeAvailable ? "passed" : "unavailable", themeRevision ? `已读取首页发布版本 ${themeRevision}，仍需核对真实域名上的页面。` : "使用 Paper 默认页面或尚无装修发布版；保存草稿不等于公开页面已验收。"),
    ...manualReadinessChecks(site).map(check => {
      const record = records.find(row => row.checkId === check.id);
      return { ...check, record, status: storageAvailable ? recordStatus(record, contextHash, now) : "unavailable" as const };
    }),
  ];
  return { siteId, siteName: site.name, contextHash, checkedAt: new Date(now).toISOString(), storageAvailable, checks, canLaunch: launchAllowed(checks, storageAvailable) };
}

export async function verifyBrandReadiness(siteId: string, input: unknown, viewer: OpsViewer | null): Promise<ReadinessSnapshot> {
  if (!readinessActorAllowed(viewer)) throw new Error("individual_admin_required");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_readiness_record");
  const value = input as Record<string, unknown>;
  if (typeof value.checkId !== "string" || (value.result !== "passed" && value.result !== "failed") ||
    (value.environment !== "production" && value.environment !== "test") ||
    typeof value.contextHash !== "string" || typeof value.evidence !== "string" ||
    value.evidence.trim().length < 10 || value.evidence.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.evidence) ||
    !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0) throw new Error("invalid_readiness_record");
  const snapshot = await brandReadiness(siteId);
  if (!snapshot.storageAvailable) throw new Error("readiness_storage_unavailable");
  if (snapshot.contextHash !== value.contextHash) throw new ReadinessConflictError("readiness_context_changed");
  if (!snapshot.checks.some(check => check.kind === "manual" && check.id === value.checkId)) throw new Error("invalid_readiness_check");
  const now = Date.now();
  await appendReadinessRecord(siteId, { checkId: value.checkId, result: value.result, contextHash: snapshot.contextHash,
    evidence: value.evidence.trim(), environment: value.environment, verifiedBy: viewer!.username, verifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString() }, Number(value.expectedRevision));
  return brandReadiness(siteId);
}
