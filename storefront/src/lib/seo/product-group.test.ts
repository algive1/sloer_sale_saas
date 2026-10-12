import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PdpVariant } from "@/lib/catalog/get-product-data";
import { PDP_VARIANT_CAP } from "@/config/variants";
import { buildProductGroupJsonLd } from "./product-group";
import { jsonLdScriptProps } from "./json-ld";
type Preview = { hasVariant: Array<{ size: string; offers: { url: string; availability: string } }>; brand?: object };
const options = { channel: "us", name: "Coat", brand: "Actual Product Brand", url: "/en/us/products/coat", images: ["https://media.example/coat.webp"], priceRange: { lowPrice: 29, highPrice: 39, currency: "USD" } };
const variant = (id: string, size: string, stock = 1): PdpVariant => ({ id, name: size, sku: "SKU-" + id, quantityAvailable: stock,
  selectionAttributes: [{ attribute: { slug: "size", name: "Size" }, values: [{ name: size, slug: size.toLowerCase() }] }],
  nonSelectionAttributes: [], media: [], pricing: { price: { gross: { amount: size === "Small" ? 29 : 39, currency: "USD" } } },
} as unknown as PdpVariant);
beforeEach(() => vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([
  { id: "fashion", name: "Fashion Seller", domains: ["fashion.example"], channels: ["us"], defaultChannel: "us" },
  { id: "jewelry", name: "Jewelry Seller", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
])));
afterEach(() => vi.unstubAllEnvs());
it("represents complete native variants with scoped parent/child URLs, SKU, exact price and individual stock", () => {
  const group = buildProductGroupJsonLd(options, "UHJvZHVjdDox", [variant("id/a+=", "Small"), variant("large", "Large", 0)], 2);
  const json = JSON.parse(JSON.stringify(group)) as Preview;
  expect(json).toMatchObject({ "@type": "ProductGroup", url: "https://fashion.example/en/us/products/coat", productGroupID: "UHJvZHVjdDox", variesBy: ["https://schema.org/size"], brand: { name: "Actual Product Brand" } });
  expect(json.hasVariant).toHaveLength(2);
  expect(new URL(json.hasVariant[0].offers.url).searchParams.get("variant")).toBe("id/a+=");
  expect(json.hasVariant[0]).toMatchObject({ size: "Small", sku: "SKU-id/a+=", offers: { price: 29, priceCurrency: "USD", availability: "https://schema.org/InStock", seller: { name: "Fashion Seller" } } });
  expect(json.hasVariant[1].offers.availability).toBe("https://schema.org/OutOfStock");
  expect(JSON.stringify(json)).not.toMatch(/Jewelry Seller|jewelry.example|aggregateRating|merchantReturnDays|shippingDetails/);
});
it("never emits a partial/over-budget matrix or a group for an unowned channel", () => {
  const variants = [variant("one", "Small"), variant("two", "Large")];
  for (const count of [1, 3, PDP_VARIANT_CAP + 1]) expect(buildProductGroupJsonLd(options, "product", variants, count)).toBeNull();
  expect(buildProductGroupJsonLd({ ...options, channel: "foreign" }, "product", variants, 2)).toBeNull();
});
it("retains fallback on missing/duplicate SKU, unknown stock, missing images or invalid/mismatched money", () => {
  const patches = [{ sku: null }, { sku: " " }, { id: "one" }, { sku: "SKU-one" }, { quantityAvailable: null }, { quantityAvailable: -1 },
    { pricing: null }, { pricing: { price: { gross: { amount: NaN, currency: "USD" } } } }, { pricing: { price: { gross: { amount: 39, currency: "EUR" } } } }];
  for (const patch of patches) expect(buildProductGroupJsonLd(options, "product", [variant("one", "Small"), { ...variant("two", "Large"), ...patch } as PdpVariant], 2)).toBeNull();
  expect(buildProductGroupJsonLd({ ...options, images: [] }, "product", [variant("one", "Small"), variant("two", "Large")], 2)).toBeNull();
});
it("requires explicitly mapped complete attributes rather than guessing a translated name or omitting a varying dimension", () => {
  const one = variant("one", "Small"); const two = variant("two", "Large");
  two.selectionAttributes[0].attribute.slug = "custom-size";
  expect(buildProductGroupJsonLd(options, "product", [one, two], 2)).toBeNull();
  two.selectionAttributes = []; expect(buildProductGroupJsonLd(options, "product", [one, two], 2)).toBeNull();
  two.selectionAttributes = one.selectionAttributes; expect(buildProductGroupJsonLd(options, "product", [one, two], 2)).toBeNull();
});
it("preserves translated values, omits an unknown brand and safely escapes merchant text", () => {
  const one = variant("one", "Small"); one.selectionAttributes[0].values[0].translation = { name: "Petit" };
  const group = buildProductGroupJsonLd({ ...options, name: '</script><script>alert(1)</script>', brand: null }, "product", [one, variant("two", "Large")], 2);
  const json = JSON.parse(JSON.stringify(group)) as Preview; expect(json.hasVariant[0].size).toBe("Petit"); expect(json.brand).toBeUndefined();
  expect(jsonLdScriptProps(group)?.dangerouslySetInnerHTML.__html).not.toContain("</script>");
});
