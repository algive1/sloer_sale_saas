import type { Product, ProductGroup, WithContext } from "schema-dts";
import type { PdpVariant } from "@/lib/catalog/get-product-data";
import { brandSiteForChannel } from "@/config/brand-sites";
import { seoConfig } from "./config";
import { PDP_VARIANT_CAP } from "@/config/variants";
import { PRODUCT_GROUP_ATTRIBUTES } from "@/config/seo-product-variants";
import { buildProductJsonLd } from "./json-ld";

type Options = Parameters<typeof buildProductJsonLd>[0];
type Property = "color" | "size" | "material" | "pattern";
const properties: readonly Property[] = ["color", "size", "material", "pattern"];
function imageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function attributes(variant: PdpVariant): { dimensions: Partial<Record<Property, string>>; signatures: Record<string, string> } | null {
  const dimensions: Partial<Record<Property, string>> = {}; const signatures: Record<string, string> = {};
  for (const item of variant.selectionAttributes) {
    const slug = item.attribute.slug?.toLowerCase(); if (!slug || slug in signatures) return null;
    // Multiple values cannot safely be interpreted as one selectable size/color.
    if (item.values.length !== 1) return null;
    const value = (item.values[0].translation?.name || item.values[0].name || item.values[0].value)?.trim();
    if (!value || value.length > 200) return null;
    signatures[slug] = value;
    const property = Object.hasOwn(PRODUCT_GROUP_ATTRIBUTES, slug) ? PRODUCT_GROUP_ATTRIBUTES[slug] : undefined;
    if (property) { if (property in dimensions) return null; dimensions[property] = value; }
  }
  return { dimensions, signatures };
}

/** Complete, bounded native variant matrix only. Incomplete facts retain the existing Product fallback. */
export function buildProductGroupJsonLd(options: Options, productId: string, variants: readonly PdpVariant[], totalCount: number): WithContext<ProductGroup> | null {
  if (totalCount < 2 || totalCount > PDP_VARIANT_CAP || variants.length !== totalCount || !productId || productId.length > 50) return null;
  const parent = buildProductJsonLd(options);
  if (!parent || typeof parent.url !== "string" || !imageUrl(parent.url)) return null;
  const ids = new Set<string>(); const skus = new Set<string>(); const rows: Product[] = []; const facts: NonNullable<ReturnType<typeof attributes>>[] = [];
  const sellerName = brandSiteForChannel(options.channel)?.name ?? seoConfig.organizationName;
  const expectedCurrency = options.price?.currency ?? options.priceRange?.currency;
  let currency: string | null = null;
  for (const variant of variants) {
    const sku = variant.sku?.trim(); const price = variant.pricing?.price?.gross;
    const stock = variant.quantityAvailable; const dimensions = attributes(variant);
    const images = variant.media?.filter(media => media.type === "IMAGE").map(media => media.url).filter(imageUrl);
    const image = images?.length ? images : options.images?.filter(imageUrl);
    if (!variant.id || ids.has(variant.id) || !sku || skus.has(sku) || !price ||
      !Number.isFinite(price.amount) || price.amount < 0 || !/^[A-Z]{3}$/.test(price.currency) ||
      (currency && currency !== price.currency) || (expectedCurrency && expectedCurrency !== price.currency) || stock == null || !Number.isFinite(stock) || stock < 0 ||
      !dimensions || !image?.length) return null;
    ids.add(variant.id); skus.add(sku); currency = price.currency; facts.push(dimensions);
    const url = new URL(parent.url); url.searchParams.set("variant", variant.id);
    rows.push({ "@type": "Product", "@id": url.toString() + "#product", url: url.toString(),
      name: variant.name && variant.name !== options.name ? `${options.name} - ${variant.name}` : options.name,
      description: parent.description, image, sku, brand: parent.brand, inProductGroupWithID: productId,
      ...dimensions.dimensions,
      offers: { "@type": "Offer", url: url.toString(), price: price.amount, priceCurrency: price.currency,
        seller: { "@type": "Organization", name: sellerName },
        availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
    });
  }
  // An unmapped varying dimension must not silently disappear from variesBy.
  const slugs = new Set(facts.flatMap(fact => Object.keys(fact.signatures)));
  for (const slug of slugs) {
    const values = new Set(facts.map(fact => fact.signatures[slug] ?? ""));
    if (values.has("")) return null;
    if (values.size > 1 && !Object.hasOwn(PRODUCT_GROUP_ATTRIBUTES, slug)) return null;
  }
  const variesBy = properties.filter(property => facts.every(fact => !!fact.dimensions[property]) &&
    new Set(facts.map(fact => fact.dimensions[property])).size > 1).map(property => "https://schema.org/" + property);
  if (!variesBy.length) return null;
  return { "@context": "https://schema.org", "@type": "ProductGroup", "@id": parent.url + "#product-group",
    url: parent.url, name: parent.name, description: parent.description, image: options.images?.filter(imageUrl), brand: parent.brand,
    productGroupID: productId, variesBy, hasVariant: rows,
  };
}
