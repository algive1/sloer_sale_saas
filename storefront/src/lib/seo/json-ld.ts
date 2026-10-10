import type { WithContext, Product } from "schema-dts";
import { serializeForInlineScript } from "@/lib/html/inline-script";
import { brandSiteForChannel, brandSitesConfigured } from "@/config/brand-sites";
import { seoConfig, getBaseUrl } from "./config";

/**
 * Product JSON-LD structured data builder
 *
 * Creates Schema.org Product markup for rich Google search results.
 * This helps your products appear with prices, availability, and images in search.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 *
 * @example
 * const jsonLd = buildProductJsonLd({
 *   channel: params.channel,
 *   name: product.name,
 *   description: product.seoDescription,
 *   images: product.media?.map(m => m.url),
 *   sku: variant?.sku,
 *   brand: product.brand,
 *   url: `/products/${product.slug}`,
 *   price: { amount: 29.99, currency: "USD" },
 *   inStock: true,
 * });
 *
 * // In your page (jsonLdScriptProps escapes the payload for an inline <script>):
 * <script {...jsonLdScriptProps(jsonLd)} />
 */
export function buildProductJsonLd(options: {
	/** Resolved route channel; brand mapping stays params-only and PPR-safe. */
	channel: string;
	name: string;
	description?: string;
	images?: string[];
	sku?: string | null;
	brand?: string | null;
	url?: string;
	/** Single variant pricing */
	price?: {
		amount: number;
		currency: string;
	} | null;
	/** Price range for products with variants */
	priceRange?: {
		lowPrice: number;
		highPrice: number;
		currency: string;
	} | null;
	inStock?: boolean;
	variantCount?: number;
}): WithContext<Product> | null {
	if (!seoConfig.enableJsonLd) {
		return null;
	}

	const {
		name,
		description,
		images,
		sku,
		brand,
		url,
		price,
		priceRange,
		inStock = true,
		variantCount,
	} = options;

	const site = brandSiteForChannel(options.channel);
	// Unknown channels must never inherit another brand's global identity.
	if (brandSitesConfigured() && !site) return null;
	const baseUrl = site ? `https://${site.domains[0]}` : getBaseUrl().replace(/\/$/, "");
	const fullUrl = url ? `${baseUrl}${url}` : undefined;
	const sellerName = site?.name ?? seoConfig.organizationName;
	const actualBrand = brand?.trim();

	return {
		"@context": "https://schema.org",
		"@type": "Product",
		name,
		description: description || name,
		image: images && images.length > 0 ? images : undefined,
		...(sku && { sku }),
		...(actualBrand && { brand: { "@type": "Brand" as const, name: actualBrand } }),
		offers: price
			? {
					"@type": "Offer",
					url: fullUrl,
					availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
					priceCurrency: price.currency,
					price: price.amount,
					seller: {
						"@type": "Organization",
						name: sellerName,
					},
				}
			: priceRange
				? {
						"@type": "AggregateOffer",
						url: fullUrl,
						availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
						priceCurrency: priceRange.currency,
						lowPrice: priceRange.lowPrice,
						highPrice: priceRange.highPrice,
						offerCount: variantCount,
						seller: {
							"@type": "Organization",
							name: sellerName,
						},
					}
				: undefined,
	};
}

/**
 * JSON-LD Script component helper
 *
 * @example
 * <script {...jsonLdScriptProps(productJsonLd)} />
 */
export function jsonLdScriptProps(data: object | null) {
	if (!data) return null;
	return {
		type: "application/ld+json",
		dangerouslySetInnerHTML: { __html: serializeForInlineScript(data) },
	};
}
