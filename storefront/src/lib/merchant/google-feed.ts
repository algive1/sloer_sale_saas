import { parseEditorJSToText } from "@/lib/editorjs";
import { buildStorefrontPath } from "@/lib/storefront-path";

export type MerchantAttribute = {
	text?: string | null;
	choice?: { name?: string | null; slug?: string | null } | null;
};

export type MerchantVariantAttribute = {
	attribute: { slug?: string | null };
	values: Array<{
		name?: string | null;
		slug?: string | null;
		value?: string | null;
	}>;
};

export type GoogleMerchantVariant = {
	id: string;
	name?: string | null;
	sku?: string | null;
	quantityAvailable?: number | null;
	attributes: MerchantVariantAttribute[];
	imageUrl?: string | null;
	price?: {
		amount: number;
		currency: string;
	} | null;
};

export type GoogleMerchantProduct = {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	seoDescription?: string | null;
	isAvailable?: boolean | null;
	imageUrl?: string | null;
	brand?: MerchantAttribute | null;
	googleProductCategory?: MerchantAttribute | null;
	gender?: MerchantAttribute | null;
	ageGroup?: MerchantAttribute | null;
	variants: GoogleMerchantVariant[];
};

export type GoogleMerchantFeedOptions = {
	baseUrl: string;
	channel: string;
	locale: string;
	storeName: string;
	defaultBrand?: string | null;
	excludeSkuPrefixes?: readonly string[];
};

function xmlEscape(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function cleanText(value: string | null | undefined, maxLength: number): string {
	return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function attributeText(attribute: MerchantAttribute | null | undefined): string | null {
	const value = attribute?.text?.trim() || attribute?.choice?.name?.trim() || attribute?.choice?.slug?.trim();
	return value || null;
}

function variantAttribute(
	attributes: readonly MerchantVariantAttribute[],
	slug: string,
): string | null {
	const match = attributes.find((item) => item.attribute.slug?.toLowerCase() === slug);
	const value = match?.values?.[0];
	return value?.name?.trim() || value?.value?.trim() || value?.slug?.trim() || null;
}

function normalizeGender(value: string | null): string | null {
	if (!value) return null;
	const normalized = value.toLowerCase();
	if (normalized === "male" || normalized === "female" || normalized === "unisex") return normalized;
	return null;
}

function normalizeAgeGroup(value: string | null): string | null {
	if (!value) return null;
	const normalized = value.toLowerCase().replaceAll(" ", "_");
	const allowed = new Set(["newborn", "infant", "toddler", "kids", "adult"]);
	return allowed.has(normalized) ? normalized : null;
}

function shouldExcludeSku(sku: string | null | undefined, prefixes: readonly string[]): boolean {
	if (!sku) return false;
	return prefixes.some((prefix) => prefix && sku.startsWith(prefix));
}

function itemXml(
	product: GoogleMerchantProduct,
	variant: GoogleMerchantVariant,
	options: GoogleMerchantFeedOptions,
): string | null {
	if (!variant.price?.amount || variant.price.amount <= 0) return null;
	if (shouldExcludeSku(variant.sku, options.excludeSkuPrefixes ?? [])) return null;

	const title = cleanText(
		variant.name && variant.name !== product.name ? `${product.name} - ${variant.name}` : product.name,
		150,
	);
	const description = cleanText(
		product.seoDescription || parseEditorJSToText(product.description) || product.name,
		5000,
	);
	const itemId = cleanText(variant.sku || `${options.channel}-${variant.id}`, 50);
	const groupId = cleanText(product.id, 50);
	const productPath = buildStorefrontPath(
		options.locale,
		options.channel,
		`/products/${encodeURIComponent(product.slug)}`,
	);
	const link = new URL(productPath, options.baseUrl);
	link.searchParams.set("variant", variant.id);

	const imageUrl = variant.imageUrl || product.imageUrl;
	const availability =
		variant.quantityAvailable === null || variant.quantityAvailable === undefined
			? product.isAvailable === false
				? "out_of_stock"
				: "in_stock"
			: variant.quantityAvailable > 0
				? "in_stock"
				: "out_of_stock";

	const gtin = variantAttribute(variant.attributes, "gtin");
	const mpn = variantAttribute(variant.attributes, "mpn");
	const color = variantAttribute(variant.attributes, "color") || variantAttribute(variant.attributes, "colour");
	const size = variantAttribute(variant.attributes, "size");
	const brand = attributeText(product.brand) || options.defaultBrand || null;
	const productCategory = attributeText(product.googleProductCategory);
	const gender = normalizeGender(attributeText(product.gender));
	const ageGroup = normalizeAgeGroup(attributeText(product.ageGroup));

	const fields: Array<[string, string | null]> = [
		["g:id", itemId],
		["g:item_group_id", groupId],
		["g:title", title],
		["g:description", description],
		["g:link", link.toString()],
		["g:image_link", imageUrl ?? null],
		["g:availability", availability],
		["g:price", `${variant.price.amount.toFixed(2)} ${variant.price.currency}`],
		["g:condition", "new"],
		["g:brand", brand],
		["g:gtin", gtin],
		["g:mpn", mpn],
		["g:google_product_category", productCategory],
		["g:color", color],
		["g:size", size],
		["g:gender", gender],
		["g:age_group", ageGroup],
		...(!gtin && !mpn ? ([["g:identifier_exists", "false"]] as Array<[string, string]>) : []),
	];

	const body = fields
		.filter((entry): entry is [string, string] => Boolean(entry[1]))
		.map(([tag, value]) => `      <${tag}>${xmlEscape(value)}</${tag}>`)
		.join("\n");

	return `    <item>\n${body}\n    </item>`;
}

export function buildGoogleMerchantXml(
	products: readonly GoogleMerchantProduct[],
	options: GoogleMerchantFeedOptions,
): string {
	const items = products
		.flatMap((product) =>
			product.variants
				.map((variant) => itemXml(product, variant, options))
				.filter((item): item is string => Boolean(item)),
		)
		.join("\n");

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
		"  <channel>",
		`    <title>${xmlEscape(options.storeName)}</title>`,
		`    <link>${xmlEscape(options.baseUrl)}</link>`,
		`    <description>${xmlEscape(`${options.storeName} product feed`)}</description>`,
		items,
		"  </channel>",
		"</rss>",
		"",
	].join("\n");
}
