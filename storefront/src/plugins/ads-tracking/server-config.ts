import "server-only";
import { brandSiteForChannel, brandSiteForHost, getBrandSites } from "@/config/brand-sites";
import { gaMeasurementId } from "./ga4-config";
import { metaPixelId, tiktokPixelId } from "./config";

export type AdDestination = "ga4" | "meta" | "tiktok";
export type ServerAdScope = {
  siteId: string; name: string; domains: readonly string[]; origin: string;
  ga4?: { id: string; secret: string };
  meta?: { id: string; secret: string };
  tiktok?: { id: string; secret: string };
};

function secret(value: unknown): value is string {
  return typeof value === "string" && /^[\x21-\x7e]{8,4096}$/.test(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A malformed or incomplete brand registry never falls back to global tokens. */
export function serverAdScopes(): ServerAdScope[] {
  const sites = getBrandSites();
  if (!sites) {
    let origin = "";
    try {
      const url = new URL(process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "");
      if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) origin = url.origin;
    } catch { /* No valid origin disables this configuration. */ }
    const ga4 = gaMeasurementId(); const meta = metaPixelId(); const tiktok = tiktokPixelId();
    const gaSecret = process.env.GA4_API_SECRET; const metaSecret = process.env.META_CONVERSIONS_API_TOKEN; const tikSecret = process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN;
    return [{ siteId: "legacy:single", name: "当前站点", domains: [], origin,
      ...(ga4 && secret(gaSecret) ? { ga4: { id: ga4, secret: gaSecret } } : {}),
      ...(meta && secret(metaSecret) ? { meta: { id: meta, secret: metaSecret } } : {}),
      ...(tiktok && secret(tikSecret) ? { tiktok: { id: tiktok, secret: tikSecret } } : {}) }];
  }
  const configs = new Map<string, Record<string, unknown>>();
  const raw = process.env.ADS_SERVER_SITES_JSON?.trim();
  if (raw) {
    let entries: unknown;
    try { entries = JSON.parse(raw); } catch { throw new Error("invalid_server_ads_config"); }
    if (!Array.isArray(entries) || entries.length > sites.length) throw new Error("invalid_server_ads_config");
    for (const row of entries) {
      if (!object(row) || typeof row.siteId !== "string" || !sites.some(site => site.id === row.siteId) || configs.has(row.siteId)) throw new Error("invalid_server_ads_config");
      configs.set(row.siteId, row);
    }
  }
  return sites.map(site => {
    const row = configs.get(site.id) ?? {};
    const scope: ServerAdScope = { siteId: site.id, name: site.name, domains: site.domains, origin: `https://${site.domains[0]}` };
    for (const destination of ["ga4", "meta", "tiktok"] as const) {
      const value = row[destination];
      if (value === undefined) continue;
      if (!object(value) || typeof value.id !== "string" || !secret(value.secret)) throw new Error("invalid_server_ads_config");
      const id = destination === "ga4" ? gaMeasurementId(value.id) : destination === "meta" ? metaPixelId(value.id) : tiktokPixelId(value.id);
      if (!id) throw new Error("invalid_server_ads_config");
      scope[destination] = { id, secret: value.secret };
    }
    return scope;
  });
}

export function serverAdScope(channel: string, host: string | null, verifiedOrder = false): ServerAdScope | null {
  const scopes = serverAdScopes();
  if (scopes[0]?.siteId === "legacy:single") return scopes[0].origin ? scopes[0] : null;
  const site = brandSiteForChannel(channel);
  if (!site || (!verifiedOrder && brandSiteForHost(host)?.id !== site.id)) return null;
  return scopes.find(scope => scope.siteId === site.id) ?? null;
}

/** Only IDs/status are serialized; never spread a credential-bearing scope. */
export function serverAdConfiguration() {
  return serverAdScopes().map(scope => ({ siteId: scope.siteId, name: scope.name, origin: scope.origin,
    destinations: (["ga4", "meta", "tiktok"] as const).map(destination => ({ destination, id: scope[destination]?.id ?? "", configured: !!scope[destination] })) }));
}
