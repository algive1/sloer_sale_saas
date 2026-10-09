import { getBrandSites } from "@/config/brand-sites";
import { getChatwootBinding, parseChatwootSupportConfig } from "../config";

export type BotBinding = Readonly<{
  siteId: string;
  accountId: number;
  inboxId: number;
  webhookSecret: string;
  apiToken: string;
}>;
export type PublishedFaq = Readonly<{
  siteId: string;
  id: string;
  locale: string;
  question: string;
  answer: string;
  keywords: readonly string[];
  sourceUrl: string;
}>;
export type ProviderConfig = Readonly<{
  url: string;
  key: string;
  model: string;
}>;
export type AIConfig = Readonly<{
  chatwootUrl: string;
  bots: readonly BotBinding[];
  faqs: readonly PublishedFaq[];
  provider: ProviderConfig;
}>;

function records(raw: string | undefined, label: string): Record<string, unknown>[] {
  let value: unknown;
  try { value = JSON.parse(raw || ""); }
  catch { throw new Error("Invalid " + label); }
  if (!Array.isArray(value) || !value.length || value.length > 250 ||
      value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new Error(label + " must be a non-empty JSON array of objects");
  }
  return value as Record<string, unknown>[];
}
function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function bounded(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}
function providerConfig(): ProviderConfig {
  const urlRaw = process.env.SUPPORT_AI_MODEL_URL;
  const key = process.env.SUPPORT_AI_MODEL_API_KEY;
  const model = process.env.SUPPORT_AI_MODEL_NAME;
  if (!urlRaw || !bounded(key, 16, 4096) || !bounded(model, 1, 120)) {
    throw new Error("AI model endpoint, key and name are required together");
  }
  let url: URL;
  try { url = new URL(urlRaw); }
  catch { throw new Error("Invalid AI model URL"); }
  if (url.protocol !== "https:" || !!url.username || !!url.password ||
      !!url.search || !!url.hash || url.pathname !== "/v1/chat/completions") {
    throw new Error("AI model URL must be a trusted HTTPS /v1/chat/completions endpoint");
  }
  return { url: url.href, key, model };
}

/** Server-only loader: fail closed if any configured brand, bot or FAQ mapping is inconsistent. */
export function loadAIConfig(): AIConfig | null {
  if (!process.env.SUPPORT_AI_BOTS_JSON?.trim()) return null;

  const brands = getBrandSites();
  const siteIds = brands?.map((site) => site.id) ??
    [process.env.STOREFRONT_SITE_ID?.trim() || "primary"];
  const support = parseChatwootSupportConfig(
    process.env.SUPPORT_CHATWOOT_BASE_URL,
    process.env.SUPPORT_CHATWOOT_SITES_JSON,
    siteIds,
    process.env.NODE_ENV !== "production",
  );
  if (!support) throw new Error("Chatwoot support must be configured before AI");
  const provider = providerConfig();
  const rawBots = records(process.env.SUPPORT_AI_BOTS_JSON, "SUPPORT_AI_BOTS_JSON");
  const bots: BotBinding[] = [];
  const usedSites = new Set<string>();
  const usedInboxes = new Set<string>();
  const usedWebhookSecrets = new Set<string>();
  const usedApiTokens = new Set<string>();
  for (const item of rawBots) {
    const { siteId, accountId, inboxId, webhookSecret, apiToken } = item;
    if (typeof siteId !== "string" || !positiveId(accountId) || !positiveId(inboxId) ||
        !bounded(webhookSecret, 32, 512) || !bounded(apiToken, 16, 1024)) {
      throw new Error("Invalid AI bot binding");
    }
    if (getChatwootBinding(support, siteId)?.accountId !== accountId) {
      throw new Error("AI bot Account must belong to the configured storefront brand");
    }
    if (usedSites.has(siteId) || usedInboxes.has(String(accountId) + ":" + String(inboxId)) ||
        usedWebhookSecrets.has(webhookSecret) || usedApiTokens.has(apiToken)) {
      throw new Error("Duplicate AI bot site or Inbox");
    }
    usedWebhookSecrets.add(webhookSecret);
    usedApiTokens.add(apiToken);
    usedSites.add(siteId);
    usedInboxes.add(String(accountId) + ":" + String(inboxId));
    bots.push({ siteId, accountId, inboxId, webhookSecret, apiToken });
  }

  const rawFaqs = records(process.env.SUPPORT_AI_FAQS_JSON, "SUPPORT_AI_FAQS_JSON");
  const faqs: PublishedFaq[] = [];
  const usedIds = new Set<string>();
  for (const item of rawFaqs) {
    const { siteId, id, locale, question, answer, keywords, sourceUrl } = item;
    if (typeof siteId !== "string" || !usedSites.has(siteId) ||
        !bounded(id, 1, 64) || !/^[a-zA-Z0-9_-]+$/.test(id) ||
        !bounded(locale, 2, 12) || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(locale) ||
        !bounded(question, 5, 300) || !bounded(answer, 1, 1600) ||
        !Array.isArray(keywords) || keywords.length > 15 ||
        keywords.some((k) => !bounded(k, 2, 80))) {
      throw new Error("Invalid AI FAQ");
    }
    if (usedIds.has(siteId + ":" + id)) throw new Error("Duplicate site FAQ ID");
    usedIds.add(siteId + ":" + id);
    let url: URL;
    try { url = new URL(String(sourceUrl)); }
    catch { throw new Error("Invalid FAQ source URL"); }
    const domain = brands?.find((brand) => brand.id === siteId)?.domains ?? [];
    let fallbackHost = "";
    if (!brands) {
      try { fallbackHost = new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL || "").hostname; }
      catch { /* invalid origin is never trusted */ }
    }
    if (url.protocol !== "https:" || !!url.username || !!url.password ||
        !!url.hash || !!url.search || !(domain.includes(url.hostname) || (!brands && url.hostname === fallbackHost))) {
      throw new Error("FAQ link must be an HTTPS URL on the owning brand domain");
    }
    faqs.push({
      siteId, id, locale, question, answer,
      keywords: keywords as string[], sourceUrl: url.href,
    });
  }
  for (const bot of bots) {
    if (!faqs.some((faq) => faq.siteId === bot.siteId)) {
      throw new Error("Every enabled AI brand requires published FAQs");
    }
  }
  return { chatwootUrl: support.baseUrl, bots, faqs, provider };
}
