/**
 * Static, deployment-level brand routing. No DB reads on the visitor request path.
 * A Saleor channel belongs to exactly one brand in multi-brand mode; a brand may
 * own multiple regional channels. All plugins remain installed platform-wide.
 */
export type BrandSite = Readonly<{
  id: string;
  name: string;
  domains: readonly string[];
  channels: readonly string[];
  defaultChannel: string;
  defaultLocale?: string;
  description?: string;
  logo?: string;
  logoInverted?: string;
  privacyPageSlug?: string;
  termsPageSlug?: string;
}>;

const SITE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LOCALE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/;
const DOMAIN = /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/;
const LOGO = /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:svg|png|webp)$/;
const PAGE_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/;
let memoRaw: string | undefined;
let memoSites: readonly BrandSite[] | null = null;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown, label: string, pattern: RegExp): string[] {
  if (!Array.isArray(value) || !value.length ||
      value.some((v) => typeof v !== "string" || !pattern.test(v))) {
    throw new Error("Invalid STOREFRONT_SITES_JSON " + label);
  }
  const unique = new Set(value as string[]);
  if (unique.size !== value.length) throw new Error("Duplicate STOREFRONT_SITES_JSON " + label);
  return [...unique];
}

export function parseBrandSites(raw: string | undefined): readonly BrandSite[] | null {
  if (!raw?.trim()) return null;
  let input: unknown;
  try { input = JSON.parse(raw); }
  catch { throw new Error("STOREFRONT_SITES_JSON must be valid JSON"); }
  if (!Array.isArray(input) || !input.length) {
    throw new Error("STOREFRONT_SITES_JSON must be a non-empty array");
  }
  const ids = new Set<string>();
  const domains = new Set<string>();
  const channels = new Set<string>();
  return input.map((row: unknown) => {
    if (!record(row) || typeof row.id !== "string" || !SITE_ID.test(row.id) ||
        typeof row.name !== "string" || !row.name.trim() || row.name.length > 120) {
      throw new Error("Invalid brand id or name");
    }
    const id = row.id;
    const names = strings(row.domains, "domains", DOMAIN).map((v) => v.toLowerCase());
    const markets = strings(row.channels, "channels", CHANNEL);
    if (typeof row.defaultChannel !== "string" || !markets.includes(row.defaultChannel)) {
      throw new Error("Brand defaultChannel must belong to its channels: " + id);
    }
    if (row.defaultLocale !== undefined &&
        (typeof row.defaultLocale !== "string" || !LOCALE.test(row.defaultLocale))) {
      throw new Error("Invalid brand defaultLocale: " + id);
    }
    if (row.description !== undefined &&
        (typeof row.description !== "string" || row.description.length > 300)) {
      throw new Error("Invalid brand description: " + id);
    }
    for (const key of ["logo", "logoInverted"] as const) {
      const value = row[key];
      if (value !== undefined && (typeof value !== "string" || !LOGO.test(value))) {
        throw new Error("Invalid brand " + key + ": " + id);
      }
    }
    for (const key of ["privacyPageSlug", "termsPageSlug"] as const) {
      const value = row[key];
      if (value !== undefined && (typeof value !== "string" || !PAGE_SLUG.test(value))) {
        throw new Error("Invalid brand " + key + ": " + id);
      }
    }
    if (ids.has(id)) throw new Error("Duplicate brand site id: " + id);
    ids.add(id);
    for (const domain of names) {
      if (domains.has(domain)) throw new Error("Domain is assigned to multiple brands: " + domain);
      domains.add(domain);
    }
    for (const channel of markets) {
      if (channels.has(channel)) throw new Error("Channel is assigned to multiple brands: " + channel);
      channels.add(channel);
    }
    return {
      id, name: row.name.trim(), domains: names, channels: markets,
      defaultChannel: row.defaultChannel,
      ...(typeof row.defaultLocale === "string" && row.defaultLocale ? { defaultLocale: row.defaultLocale } : {}),
      ...(typeof row.description === "string" && row.description ? { description: row.description } : {}),
      ...(typeof row.logo === "string" && row.logo ? { logo: row.logo } : {}),
      ...(typeof row.logoInverted === "string" && row.logoInverted ? { logoInverted: row.logoInverted } : {}),
      ...(typeof row.privacyPageSlug === "string" && row.privacyPageSlug ? { privacyPageSlug: row.privacyPageSlug } : {}),
      ...(typeof row.termsPageSlug === "string" && row.termsPageSlug ? { termsPageSlug: row.termsPageSlug } : {}),
    };
  });
}

export function getBrandSites(): readonly BrandSite[] | null {
  const raw = process.env.STOREFRONT_SITES_JSON;
  if (raw !== memoRaw) {
    // Do not memoize invalid configuration as an empty list.
    const parsed = parseBrandSites(raw);
    memoSites = parsed;
    memoRaw = raw;
  }
  return memoSites;
}

export function brandSitesConfigured(): boolean {
  return Boolean(process.env.STOREFRONT_SITES_JSON?.trim());
}

/** Use the trusted incoming Host set by the reverse proxy, never x-forwarded-host. */
export function hostName(value: string | null): string | null {
  if (!value || value.includes(",") || value.includes("/") || value.includes("@")) return null;
  const normalized = value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return DOMAIN.test(normalized) ? normalized : null;
}

export function brandSiteForHost(host: string | null): BrandSite | null {
  const normalized = hostName(host);
  return getBrandSites()?.find((site) => normalized && site.domains.includes(normalized)) ?? null;
}

/** Channel identity is unambiguous by configuration validation. */
export function brandSiteForChannel(channel: string): BrandSite | null {
  return getBrandSites()?.find((site) => site.channels.includes(channel)) ?? null;
}

/** Existing single-brand deployments keep their current STOREFRONT_SITE_ID. */
export function siteIdForChannel(channel: string): string {
  if (brandSitesConfigured()) {
    const site = brandSiteForChannel(channel);
    if (!site) throw new Error("Channel has no configured brand: " + channel);
    return site.id;
  }
  const legacy = process.env.STOREFRONT_SITE_ID?.trim() || "primary";
  if (!SITE_ID.test(legacy)) throw new Error("Invalid STOREFRONT_SITE_ID");
  return legacy;
}

/** A user-supplied channel cannot authorize itself on a different Host. */
export function channelBelongsToHost(channel: string, host: string | null): boolean {
  if (!brandSitesConfigured()) return true;
  const site = brandSiteForHost(host);
  return Boolean(site?.channels.includes(channel));
}
