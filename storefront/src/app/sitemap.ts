import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";

import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { fetchSitemapCatalogSlugs } from "@/lib/seo/sitemap-source";
import { getBaseUrl } from "@/lib/seo/config";
import { buildStorefrontPath } from "@/lib/storefront-path";


function absoluteUrl(pathname: string, baseUrl: string): string {
	const base = baseUrl.replace(/\/$/, "");
	return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function storefrontPairs(): Promise<Array<{ locale: string; channel: string }>> {
	const configured = getConfiguredLocaleChannelPairs();
	if (configured) {
		return [...configured];
	}

	const [locales, channels] = await Promise.all([
		Promise.resolve(getStorefrontLocaleSlugs()),
		getStorefrontChannelSlugs(),
	]);

	return locales.flatMap((locale) => channels.map((channel) => ({ locale, channel })));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A single domain must never advertise the catalog of another brand.
  const site = brandSitesConfigured() ? brandSiteForHost((await headers()).get("host")) : null;
  if (brandSitesConfigured() && !site) return [];
  const pairs = (await storefrontPairs()).filter(({ channel }) => !site || site.channels.includes(channel));
  const baseUrl = site ? `https://${site.domains[0]}` : getBaseUrl();
	const entries: MetadataRoute.Sitemap = [];

	for (const { locale, channel } of pairs) {
		const prefix = (suffix = "") => buildStorefrontPath(locale, channel, suffix);
		entries.push(
			{ url: absoluteUrl(prefix(), baseUrl), changeFrequency: "daily", priority: 1 },
			{ url: absoluteUrl(prefix("/products"), baseUrl), changeFrequency: "daily", priority: 0.9 },
		);

		const catalog = await fetchSitemapCatalogSlugs(channel, locale);

		for (const slug of catalog.products) {
			entries.push({
				url: absoluteUrl(prefix(`/products/${encodeURIComponent(slug)}`), baseUrl),
				changeFrequency: "daily",
				priority: 0.8,
			});
		}

		for (const slug of catalog.categories) {
			entries.push({
				url: absoluteUrl(prefix(`/categories/${encodeURIComponent(slug)}`), baseUrl),
				changeFrequency: "weekly",
				priority: 0.7,
			});
		}

		for (const slug of catalog.collections) {
			entries.push({
				url: absoluteUrl(prefix(`/collections/${encodeURIComponent(slug)}`), baseUrl),
				changeFrequency: "weekly",
				priority: 0.7,
			});
		}
	}

	return entries;
}
