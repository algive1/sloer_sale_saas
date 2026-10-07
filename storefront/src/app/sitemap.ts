import type { MetadataRoute } from "next";

import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { fetchSitemapCatalogSlugs } from "@/lib/seo/sitemap-source";
import { getBaseUrl } from "@/lib/seo/config";
import { buildStorefrontPath } from "@/lib/storefront-path";

export const revalidate = 3600;

function absoluteUrl(pathname: string): string {
	const base = getBaseUrl().replace(/\/$/, "");
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
	const pairs = await storefrontPairs();
	const entries: MetadataRoute.Sitemap = [];

	for (const { locale, channel } of pairs) {
		const prefix = (suffix = "") => buildStorefrontPath(locale, channel, suffix);
		entries.push(
			{ url: absoluteUrl(prefix()), changeFrequency: "daily", priority: 1 },
			{ url: absoluteUrl(prefix("/products")), changeFrequency: "daily", priority: 0.9 },
		);

		const catalog = await fetchSitemapCatalogSlugs(channel, locale);

		for (const slug of catalog.products) {
			entries.push({
				url: absoluteUrl(prefix(`/products/${encodeURIComponent(slug)}`)),
				changeFrequency: "daily",
				priority: 0.8,
			});
		}

		for (const slug of catalog.categories) {
			entries.push({
				url: absoluteUrl(prefix(`/categories/${encodeURIComponent(slug)}`)),
				changeFrequency: "weekly",
				priority: 0.7,
			});
		}

		for (const slug of catalog.collections) {
			entries.push({
				url: absoluteUrl(prefix(`/collections/${encodeURIComponent(slug)}`)),
				changeFrequency: "weekly",
				priority: 0.7,
			});
		}
	}

	return entries;
}
