import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { getBaseUrl } from "@/lib/seo/config";

/**
 * Crawl policy is cost policy.
 *
 * Faceted/paginated listing URLs (`?price=`, `?colors=`, `?sizes=`, `?categories=`,
 * `?cursor=`…) are long-tail views. Listing *pages* stay params-only (cached first
 * page); the client swaps via `GET /api/listing`. Crawlers that ignore this file
 * still receive the canonical first-page HTML. Blocking the query permutations
 * loses no indexable content. Sorted views are cacheable on the API but duplicates
 * of the canonical document.
 *
 * Transactional and per-user surfaces (cart, checkout, account, search results) are
 * always-dynamic renders with nothing to index.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = brandSitesConfigured() ? brandSiteForHost((await headers()).get("host")) : null;
  if (brandSitesConfigured() && !site) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const origin = site ? `https://${site.domains[0]}` : getBaseUrl().replace(/\/$/, "");
	return {
		sitemap: `${origin}/sitemap.xml`,
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: [
					// Faceted / paginated / sorted listing permutations (uncached long tail).
					"/*?*price=",
					"/*?*colors=",
					"/*?*sizes=",
					"/*?*categories=",
					"/*?*cursor=",
					"/*?*direction=",
					"/*?*sort=",
					"/*?*query=",
					// Per-user and transactional surfaces — dynamic on every hit, never indexable.
					"/checkout",
					"/order",
					"/api/",
					"/*/cart$",
					"/*/account",
					"/*/orders",
					"/*/login",
					"/*/signup",
					"/*/search",
				],
			},
		],
	};
}
