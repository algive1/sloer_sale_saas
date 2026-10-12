import { expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_SEO_BASE_URL;
const api = process.env.SALEOR_API_URL;
test.skip(!base || !api, "Requires the pinned native Saleor storefront integration");
type NativeVariant = { id: string; sku: string; pricing: { price: { gross: { amount: number; currency: string } } }; selectionAttributes: Array<{ attribute: { slug: string }; values: Array<{ name: string }> }> };
type Group = { "@type": string; url: string; productGroupID: string; hasVariant: Array<{ sku: string; url: string; offers: { url: string; price: number; priceCurrency: string; availability: string } }>; variesBy: string[] };

test("initial HTTP HTML contains complete native ProductGroup facts and real variant preselection URLs", async ({ request, page: browser }) => {
  const slug = "cubes-fountain-tee";
  const source = await request.post(api!, { data: { query: `query SeoNativeVariants($slug:String!){product(slug:$slug,channel:"us"){id productVariants(first:100){totalCount edges{node{id sku pricing{price{gross{amount currency}}} selectionAttributes:attributes(variantSelection:VARIANT_SELECTION){attribute{slug} values{name}}}}}}}`, variables: { slug } } });
  expect(source.status(), await source.text()).toBe(200);
  const payload = await source.json(); expect(payload.errors).toBeUndefined(); const native = payload.data.product; expect(native).toBeTruthy();
  expect(native.productVariants.totalCount).toBeGreaterThan(1); expect(native.productVariants.totalCount).toBeLessThanOrEqual(100);
  const page = await request.get(base + "/en/us/products/" + slug); expect(page.status()).toBe(200);
  const html = await page.text();
  const entities = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]) as Group);
  const group = entities.find(entity => entity["@type"] === "ProductGroup"); expect(group, "Native fixture has complete SKU/size matrix; ProductGroup must be in initial HTTP HTML").toBeTruthy();
  expect(group!.productGroupID).toBe(native.id); expect(group!.hasVariant).toHaveLength(native.productVariants.totalCount); expect(group!.variesBy).toContain("https://schema.org/size");
  expect(new URL(group!.url).search).toBe("");
  const variants = native.productVariants.edges.map((edge: { node: NativeVariant }) => edge.node) as NativeVariant[];
  for (const variant of variants) {
    const item = group!.hasVariant.find(item => item.sku === variant.sku); expect(item).toBeTruthy();
    expect(new URL(item!.offers.url).searchParams.get("variant")).toBe(variant.id);
    expect(new URL(item!.offers.url).origin).toBe(new URL(group!.url).origin);
    expect(item!.offers.price).toBe(variant.pricing.price.gross.amount); expect(item!.offers.priceCurrency).toBe(variant.pricing.price.gross.currency);
    expect(["https://schema.org/InStock", "https://schema.org/OutOfStock"]).toContain(item!.offers.availability);
  }
  // Follow first and last declared links through the real UI, not merely a URL syntax check.
  for (const variant of [variants[0], variants[variants.length - 1]]) {
    const link = new URL(group!.hasVariant.find(item => item.sku === variant.sku)!.url);
    await browser.goto(base + link.pathname + link.search);
    const size = variant.selectionAttributes.find(attribute => attribute.attribute.slug === "size")!.values[0].name;
    await expect(browser.locator('[role="group"][aria-labelledby="variant-label-size"] button[aria-pressed="true"]')).toHaveText(size);
    expect(new URL(browser.url()).searchParams.get("variant")).toBe(variant.id);
  }
});
