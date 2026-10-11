import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { getStorefrontLocaleSlugs } from "@/config/locale";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { getBaseUrl } from "./config";

export type SitemapPair = { locale: string; channel: string };
export async function resolveSitemapContext(host: string | null): Promise<{ baseUrl: string; pairs: SitemapPair[] }> {
	const site = brandSitesConfigured() ? brandSiteForHost(host) : null;
	if (brandSitesConfigured() && !site) throw new Error("unknown_sitemap_host");
	const configured = getConfiguredLocaleChannelPairs();
	const channels = site?.channels ?? await getStorefrontChannelSlugs();
	const pairs = configured
		? configured.filter((pair) => !site || site.channels.includes(pair.channel))
		: getStorefrontLocaleSlugs().flatMap((locale) => channels.map((channel) => ({ locale, channel })));
	if (!pairs.length) throw new Error("sitemap_language_market_not_configured");
	return { baseUrl: site ? `https://${site.domains[0]}` : getBaseUrl().replace(/\/$/, ""), pairs: [...pairs] };
}
export function sitemapPairKey(pair: SitemapPair): string {
	return Buffer.from(JSON.stringify([pair.locale, pair.channel])).toString("base64url");
}
