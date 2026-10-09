import { brandSiteForHost, brandSitesConfigured } from "@/config/brand-sites";
import type { WishlistRecord } from "./types";

/** Browser-controlled payloads and cookies cannot select their own site partition. */
export type WishlistSiteScope = Readonly<{ siteId: string | null; channels: readonly string[] | null }>;

export function wishlistScopeFromHost(host: string | null): WishlistSiteScope | null {
  if (!brandSitesConfigured()) return { siteId: null, channels: null };
  const site = brandSiteForHost(host);
  return site ? { siteId: site.id, channels: site.channels } : null;
}

export function scopedWishlistOwnerKey(owner: string, scope: WishlistSiteScope): string {
  // Existing user/guest keys are unchanged while multi-brand is disabled.
  return scope.siteId ? `site:${scope.siteId}:${owner}` : owner;
}

export function wishlistItemBelongsToSite(item: WishlistRecord, scope: WishlistSiteScope): boolean {
  if (!scope.channels) return true;
  if (!scope.channels.includes(item.channel)) return false;
  // When a link encodes a market, it must also belong to the receiving brand.
  // The legacy site-neutral /products/... shape remains supported.
  const match = /^\/[a-z]{2,3}(?:-[a-z0-9]{2,8})?\/([a-z0-9_-]+)(?:\/|$)/.exec(item.href);
  return !match || scope.channels.includes(match[1]);
}
