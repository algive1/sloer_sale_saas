import { describe, expect, it } from "vitest";

import { buildGoogleMerchantXml, type GoogleMerchantProduct } from "./google-feed";

const product: GoogleMerchantProduct = {
	id: "UHJvZHVjdDox",
	name: "Everyday & Sneaker",
	slug: "everyday-sneaker",
	description: JSON.stringify({
		blocks: [{ type: "paragraph", data: { text: "Comfortable <b>canvas</b> shoe." } }],
	}),
	isAvailable: true,
	imageUrl: "https://cdn.example.com/product.webp",
	brand: { text: "Demo & Co" },
	googleProductCategory: { text: "Apparel & Accessories > Shoes" },
	gender: { choice: { name: "Unisex" } },
	ageGroup: { choice: { name: "Adult" } },
	variants: [
		{
			id: "VmFyaWFudDox",
			name: "Black / 9",
			sku: "SKU-BLK-9",
			quantityAvailable: 4,
			attributes: [
				{ attribute: { slug: "color" }, values: [{ name: "Black" }] },
				{ attribute: { slug: "size" }, values: [{ name: "9" }] },
				{ attribute: { slug: "gtin" }, values: [{ value: "1234567890123" }] },
				{ attribute: { slug: "mpn" }, values: [{ value: "MPN-9" }] },
			],
			price: { amount: 79, currency: "USD" },
		},
	],
};

describe("buildGoogleMerchantXml", () => {
	it("does not invent a manufacturer from the storefront name or an attribute slug", () => {
		for (const brand of [null, { text: " " }, { choice: { slug: "internal-brand-id" } }]) {
			const xml = buildGoogleMerchantXml([{ ...product, brand }], {
				baseUrl: "https://reseller.example.com",
				channel: "us", locale: "en", storeName: "Reseller Store",
			});
			expect(xml).not.toContain("<g:brand>");
		}
	});

	it("emits variant-level Google Merchant fields and escapes XML", () => {
		const xml = buildGoogleMerchantXml([product], {
			baseUrl: "https://shop.example.com",
			channel: "us",
			locale: "en",
			storeName: "Example & Store",
			defaultBrand: "Fallback Brand",
		});

		expect(xml).toContain("<title>Example &amp; Store</title>");
		expect(xml).toContain("<g:id>SKU-BLK-9</g:id>");
		expect(xml).toContain("<g:item_group_id>UHJvZHVjdDox</g:item_group_id>");
		expect(xml).toContain("<g:title>Everyday &amp; Sneaker - Black / 9</g:title>");
		expect(xml).toContain("<g:description>Comfortable canvas shoe.</g:description>");
		expect(xml).toContain("<g:availability>in_stock</g:availability>");
		expect(xml).toContain("<g:price>79.00 USD</g:price>");
		expect(xml).toContain("<g:brand>Demo &amp; Co</g:brand>");
		expect(xml).toContain("<g:gtin>1234567890123</g:gtin>");
		expect(xml).toContain("<g:mpn>MPN-9</g:mpn>");
		expect(xml).toContain("<g:color>Black</g:color>");
		expect(xml).toContain("<g:size>9</g:size>");
		expect(xml).toContain("<g:gender>unisex</g:gender>");
		expect(xml).toContain("<g:age_group>adult</g:age_group>");
		expect(xml).toContain(
			"https://shop.example.com/en/us/products/everyday-sneaker?variant=VmFyaWFudDox",
		);
	});

	it("marks missing identifiers and can exclude demo SKU prefixes", () => {
		const withoutIdentifiers: GoogleMerchantProduct = {
			...product,
			variants: [
				{
					...product.variants[0]!,
					sku: "LIVE-1",
					attributes: [],
				},
				{
					...product.variants[0]!,
					sku: "DEMO-1",
				},
			],
		};

		const xml = buildGoogleMerchantXml([withoutIdentifiers], {
			baseUrl: "https://shop.example.com",
			channel: "us",
			locale: "en",
			storeName: "Store",
			excludeSkuPrefixes: ["DEMO-"],
		});

		expect(xml).toContain("<g:id>LIVE-1</g:id>");
		expect(xml).toContain("<g:identifier_exists>false</g:identifier_exists>");
		expect(xml).not.toContain("DEMO-1");
	});
});
