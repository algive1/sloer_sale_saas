import { createHash } from "node:crypto";
import { getBrandSites, siteIdForChannel } from "@/config/brand-sites";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { getStorefrontLocaleSlugs, getLocaleDefinition, type LocaleSlug } from "@/config/locale";
import { isAllowedLocaleChannelPair } from "@/config/locale-channel";

export type Field = "name" | "description" | "seoTitle" | "seoDescription";
export type TranslatedFields = Partial<Record<Field, string>>;
export type TranslationScope = { siteId: string; channel: string; locale: LocaleSlug };

export class TranslationInputError extends Error {}
export class TranslationConflict extends Error {}

const TEXT_FIELDS: readonly Field[] = ["name", "description", "seoTitle", "seoDescription"];
const MAX_LENGTH: Record<Field, number> = { name: 400, description: 12000, seoTitle: 400, seoDescription: 1000 };

export function validateScope(raw: { siteId?: unknown; channel?: unknown; locale?: unknown }): TranslationScope {
  const { siteId, channel, locale } = raw;
  if (typeof channel !== "string" || !getStaticStorefrontChannelSlugs().includes(channel) ||
      typeof siteId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(siteId) ||
      siteIdForChannel(channel) !== siteId || typeof locale !== "string" ||
      locale === "en" || !getStorefrontLocaleSlugs().includes(locale as LocaleSlug) ||
      !getLocaleDefinition(locale) || !isAllowedLocaleChannelPair(locale, channel)) {
    throw new TranslationInputError("不允许的品牌、市场或目标语言");
  }
  return { siteId, channel, locale: locale as LocaleSlug };
}

export function normalizeSource(value: Record<string, unknown>): TranslatedFields {
  const result: TranslatedFields = {};
  for (const key of TEXT_FIELDS) {
    let text = value[key];
    if (key === "description" && typeof text === "string" && text.trim().startsWith("{")) {
      // Saleor product descriptions are EditorJS JSON; models should translate
      // merchant prose, not serialize/control embedded document structure.
      try {
        const parsed = JSON.parse(text) as { blocks?: Array<{data?:{text?:string}}> };
        text = (parsed.blocks ?? []).map(b => b.data?.text ?? "").join(" ")
          .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      } catch { throw new TranslationInputError("无法解析商品 EditorJS 原文"); }
    }
    if (typeof text === "string" && text.trim()) result[key] = text.trim().slice(0, MAX_LENGTH[key]);
  }
  return result;
}

export function sourceHash(id: string, source: TranslatedFields): string {
  return createHash("sha256").update(JSON.stringify({ id, source })).digest("hex");
}

const placeholders = (s: string) => (s.match(/\{\{[^{}]{1,80}\}\}|\{[A-Za-z][^{}]{0,80}\}|%[sd]/g) ?? []).sort();

export function parseTranslation(source: TranslatedFields, raw: unknown): TranslatedFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TranslationInputError("译文必须是字段对象");
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(source);
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new TranslationInputError("译文字段与原文不一致");
  }
  const result: TranslatedFields = {};
  for (const key of keys as Field[]) {
    const value = record[key];
    if (typeof value !== "string" || !value.trim() || value.length > MAX_LENGTH[key] * 2 ||
        /<\/?[A-Za-z][^>]*>/.test(value) ||
        JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(source[key]!))) {
      throw new TranslationInputError("译文字段无效或占位符被修改: " + key);
    }
    result[key] = value.trim();
  }
  return result;
}

export function mayPublishInScope(scope: TranslationScope): void {
  // Saleor translations belong to products globally rather than to Channels.
  // Never write a potentially shared product translation in multi-brand deployments.
  if ((getBrandSites()?.length ?? 0) > 1) {
    throw new TranslationInputError("多品牌共享 Saleor 商品译文：禁止自动发布。请先使用独立商品或经审核的导出流程。");
  }
  if (process.env.TRANSLATION_PUBLISH_ENABLED !== "1") {
    throw new TranslationInputError("线上写入未开启：需设置 TRANSLATION_PUBLISH_ENABLED=1");
  }
  validateScope(scope);
}

export function parseStoredFields(input: unknown): TranslatedFields {
  if (typeof input !== "string") throw new TranslationInputError("译文数据损坏");
  let decoded: unknown;
  try { decoded = JSON.parse(input); } catch { throw new TranslationInputError("译文数据损坏"); }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new TranslationInputError("译文数据损坏");
  return decoded as TranslatedFields;
}
