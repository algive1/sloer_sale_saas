/**
 * System-wide plugin, with a distinct Chatwoot Account and website Inbox per
 * brand. These are deployment-owned mappings, never shopper-provided site IDs.
 * Pure functions keep configuration validation independently testable.
 */
export type ChatwootSupportBinding = Readonly<{
  siteId: string;
  accountId: number;
  websiteToken: string;
}>;

export type ChatwootSupportConfig = Readonly<{
  baseUrl: string;
  sites: readonly ChatwootSupportBinding[];
}>;

const SITE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const WEBSITE_TOKEN = /^[a-zA-Z0-9_-]{8,128}$/;

export function parseChatwootSupportConfig(
  baseUrl: string | undefined,
  rawSites: string | undefined,
  expectedSiteIds: readonly string[],
  allowLocalHttp = false,
): ChatwootSupportConfig | null {
  if (!baseUrl?.trim() && !rawSites?.trim()) return null;
  if (!baseUrl?.trim() || !rawSites?.trim()) {
    throw new Error("Both SUPPORT_CHATWOOT_BASE_URL and SUPPORT_CHATWOOT_SITES_JSON are required");
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Invalid SUPPORT_CHATWOOT_BASE_URL");
  }
  const localHttp = allowLocalHttp && url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/" || !url.hostname) {
    throw new Error("Chatwoot base URL must be an HTTPS origin (HTTP loopback only for development)");
  }
  let input: unknown;
  try {
    input = JSON.parse(rawSites);
  } catch {
    throw new Error("Invalid SUPPORT_CHATWOOT_SITES_JSON");
  }
  if (!Array.isArray(input) || !input.length) {
    throw new Error("SUPPORT_CHATWOOT_SITES_JSON must be a non-empty array");
  }
  const siteIds = new Set<string>();
  const accountIds = new Set<number>();
  const tokens = new Set<string>();
  const sites: ChatwootSupportBinding[] = [];
  for (const row of input as unknown[]) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid Chatwoot site mapping");
    }
    const entry = row as Record<string, unknown>;
    const { siteId, accountId, websiteToken } = entry;
    if (typeof siteId !== "string" || !SITE_ID.test(siteId) ||
        typeof accountId !== "number" || !Number.isSafeInteger(accountId) || accountId <= 0 ||
        typeof websiteToken !== "string" || !WEBSITE_TOKEN.test(websiteToken)) {
      throw new Error("Invalid Chatwoot site ID, Account ID or website token");
    }
    if (siteIds.has(siteId) || accountIds.has(accountId) || tokens.has(websiteToken)) {
      throw new Error("Chatwoot brand, Account and website token mappings must be exclusive");
    }
    siteIds.add(siteId);
    accountIds.add(accountId);
    tokens.add(websiteToken);
    sites.push({ siteId, accountId, websiteToken });
  }
  const expected = new Set(expectedSiteIds);
  if (expected.size === 0 || expected.size !== expectedSiteIds.length ||
      sites.length !== expected.size || sites.some((site) => !expected.has(site.siteId))) {
    throw new Error("Chatwoot must configure exactly one distinct Account for every brand");
  }
  return { baseUrl: url.origin, sites };
}

export function getChatwootBinding(
  config: ChatwootSupportConfig | null,
  siteId: string,
): ChatwootSupportBinding | null {
  return config?.sites.find((site) => site.siteId === siteId) ?? null;
}
