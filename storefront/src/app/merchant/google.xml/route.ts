import { connection } from "next/server";
import { getDefaultLocaleSlug, isStorefrontLocaleSlug } from "@/config/locale";
import { brandSitesConfigured, brandSiteForHost } from "@/config/brand-sites";
import { getLocalesForChannel, isAllowedLocaleChannelPair } from "@/config/locale-channel";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { fetchGoogleMerchantProducts } from "@/lib/merchant/google-feed-source";
import { buildGoogleMerchantXml } from "@/lib/merchant/google-feed";
import { getBaseUrl, seoConfig } from "@/lib/seo/config";

function enabled(): boolean {
	const value = process.env.GOOGLE_MERCHANT_FEED_ENABLED;
	return value === "true" || value === "1";
}

function parsePrefixes(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function textResponse(message: string, status: number): Response {
	return new Response(message, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

export async function GET(request: Request): Promise<Response> {
	// This endpoint is controlled by runtime deployment config and query parameters.
	// Opt out of build-time prerendering so enabling/disabling the feed does not
	// require the route to be statically baked as a 404 or stale catalog response.
	await connection();

	if (!enabled()) {
		return textResponse("Google Merchant feed is disabled.", 404);
	}

	const url = new URL(request.url);
	// The requested Channel is not a tenant credential. Resolve and restrict
	// the feed to the exact trusted merchant hostname before querying Saleor.
	const site = brandSitesConfigured() ? brandSiteForHost(request.headers.get("host")) : null;
	if (brandSitesConfigured() && !site) return textResponse("Store not found.", 404);
	const availableChannels = await getStorefrontChannelSlugs();
	const allowedChannels = site
		? availableChannels.filter((slug) => site.channels.includes(slug))
		: availableChannels;
	const requestedChannel = url.searchParams.get("channel")?.trim();
	const channel = requestedChannel || site?.defaultChannel || allowedChannels[0];

	if (!channel || !allowedChannels.includes(channel)) {
		return textResponse("Unknown storefront channel.", 400);
	}

	const pairedLocales = getLocalesForChannel(channel);
	const requestedLocale = url.searchParams.get("locale")?.trim().toLowerCase();
	const fallbackLocale = pairedLocales?.[0] || getDefaultLocaleSlug();
	const locale = requestedLocale || fallbackLocale;

	if (!isStorefrontLocaleSlug(locale) || !isAllowedLocaleChannelPair(locale, channel)) {
		return textResponse("Locale is not enabled for this storefront channel.", 400);
	}

	const products = await fetchGoogleMerchantProducts(channel, locale);
	const xml = buildGoogleMerchantXml(products, {
		baseUrl: site ? `https://${site.domains[0]}` : getBaseUrl(),
		channel,
		locale,
		storeName: site?.name ?? seoConfig.siteName,
		// A storefront can resell other brands. Omit unknown product brands rather
		// than silently assigning the store name (same policy as product JSON-LD).
		excludeSkuPrefixes: parsePrefixes(process.env.GOOGLE_MERCHANT_EXCLUDE_SKU_PREFIXES),
	});

	return new Response(xml, {
		status: 200,
		headers: {
			"content-type": "application/xml; charset=utf-8",
			"cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
			"x-robots-tag": "noindex, nofollow",
			"vary": "Host",
		},
	});
}
