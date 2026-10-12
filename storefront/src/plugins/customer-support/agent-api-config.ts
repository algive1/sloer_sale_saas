/** Per-brand Chatwoot API credentials. Unlike websiteToken, apiToken is
 * privileged and MUST remain server-only. Never serialize this configuration
 * to a Client Component or a public API response. */
export type ChatwootAgentCredential = Readonly<{ siteId: string; apiToken: string }>;

const SITE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const API_TOKEN = /^[a-zA-Z0-9_.-]{20,256}$/;

export function parseChatwootAgentCredentials(
  raw: string | undefined,
  expectedSiteIds: readonly string[],
): readonly ChatwootAgentCredential[] | null {
  if (!raw?.trim()) return null;
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error("SUPPORT_CHATWOOT_AGENT_TOKENS_JSON must be valid JSON"); }
  if (!Array.isArray(data) || data.length !== expectedSiteIds.length ||
      new Set(expectedSiteIds).size !== expectedSiteIds.length) {
    throw new Error("One Chatwoot API token is required per configured brand");
  }
  const expected = new Set(expectedSiteIds);
  const mapped = new Set<string>();
  const tokens = new Set<string>();
  const results: ChatwootAgentCredential[] = [];
  for (const value of data) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid Chatwoot agent credential");
    }
    const item = value as Record<string, unknown>;
    if (typeof item.siteId !== "string" || !SITE_ID.test(item.siteId) ||
      !expected.has(item.siteId) || mapped.has(item.siteId) ||
      typeof item.apiToken !== "string" || !API_TOKEN.test(item.apiToken) ||
      tokens.has(item.apiToken)) {
      throw new Error("Chatwoot agent token must be valid and unique per configured brand");
    }
    mapped.add(item.siteId);
    tokens.add(item.apiToken);
    results.push({ siteId: item.siteId, apiToken: item.apiToken });
  }
  return results;
}
