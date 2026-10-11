import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WeightUnitsEnum, ProductMediaType, type OpsCatalogAuditQuery } from "@/gql/graphql";
vi.mock("server-only", () => ({}));
import { auditCatalogProduct, readCatalogAudit } from "./catalog-audit";
type Product = NonNullable<OpsCatalogAuditQuery["products"]>["edges"][number]["node"];
const now = Date.parse("2026-10-11T00:00:00.000Z");
const listing = (slug: string) => ({ channel: { slug, currencyCode: "USD", isActive: true }, isPublished: true, isAvailableForPurchase: true, visibleInListings: true, publishedAt: null, availableForPurchaseAt: null });
const product = (): Product => ({ id: "prod1", name: "Hat", slug: "hat", description: '{"blocks":[{"data":{"text":"Cotton hat"}}]}', seoTitle: "Hat", seoDescription: "Cotton hat", category: { id: "cat1" }, weight: { value: 0.25, unit: WeightUnitsEnum.Kg }, productType: { isShippingRequired: true, weight: null }, media: [{ type: ProductMediaType.Image, alt: "Cotton hat" }], brand: { text: "Real Brand" }, channelListings: [listing("fashion-us"), listing("jewelry-us")], productVariants: { pageInfo: { hasNextPage: false }, edges: [{ node: { id: "variant1", sku: "HAT-1", trackInventory: true, quantityAvailable: 5, weight: null, channelListings: [{ channel: { slug: "fashion-us" }, price: { amount: 20, currency: "USD" } }, { channel: { slug: "jewelry-us" }, price: { amount: 999, currency: "USD" } }] } }] } });
const viewer = { username: "reader", role: "brand_analyst" as const, siteIds: ["fashion"] };
beforeEach(() => {
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([{ id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us", "fashion-eu"], defaultChannel: "fashion-us" }, { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" }]));
  vi.stubEnv("SALEOR_INTERNAL_API_URL", "http://api:8000/graphql/"); vi.stubEnv("OPS_CATALOG_SALEOR_TOKEN", "catalog-private-test");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("checks real brand facts and strips other-brand market prices before serialization", () => {
  const result = auditCatalogProduct(product(), ["fashion-us", "fashion-eu"], "fashion-us", now);
  expect(result.issues).toEqual([]); expect(result.brand).toBe("Real Brand"); expect(result.markets[1].missing).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/jewelry|999/);
});
it("identifies missing price, image, SKU, weight, description and incomplete variants", () => {
  const p = product(); p.media = []; p.brand = null; p.description = '{"blocks":[]}'; p.weight = null;
  p.productVariants!.pageInfo.hasNextPage = true; const v = p.productVariants!.edges[0].node; v.sku = null; v.channelListings = []; v.trackInventory = false;
  const issues = auditCatalogProduct(p, ["fashion-us"], "fashion-us", now).issues.map(issue => issue.code);
  expect(issues).toEqual(expect.arrayContaining(["image", "brand", "description", "variants_incomplete", "sku", "weight", "untracked_stock", "price"]));
});
it("does not claim future/inactive publication or unknown stock is ready", () => {
  const p = product(); p.channelListings![0].publishedAt = "2026-10-12T00:00:00Z"; p.productVariants!.edges[0].node.quantityAvailable = null;
  expect(auditCatalogProduct(p, ["fashion-us"], "fashion-us", now).issues.map(i => i.code)).toEqual(expect.arrayContaining(["market_publication", "market_purchase", "unknown_stock"]));
  p.channelListings![0].channel.isActive = false;
  expect(auditCatalogProduct(p, ["fashion-us"], "fashion-us", now).issues.map(i => i.code)).toContain("market_inactive");
});
it("avoids shipping-weight requirements for digital products and preserves explicit zero-price review", () => {
  const p = product(); p.productType.isShippingRequired = false; p.weight = null; p.productVariants!.edges[0].node.channelListings![0].price!.amount = 0;
  const issues = auditCatalogProduct(p, ["fashion-us"], "fashion-us", now).issues;
  expect(issues.map(i => i.code)).not.toContain("weight"); expect(issues.find(i => i.code === "zero_price")?.severity).toBe("review");
});
it("authorizes brand/channel before fetching and rejects unexpected upstream scope", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [{ node: product() }] } } })); vi.stubGlobal("fetch", fetcher);
  await expect(readCatalogAudit("jewelry", viewer)).rejects.toThrow("forbidden"); await expect(readCatalogAudit("fashion", viewer, "jewelry-us")).rejects.toThrow("invalid"); expect(fetcher).not.toHaveBeenCalled();
  const result = await readCatalogAudit("fashion", viewer); expect(result.channel).toBe("fashion-us"); expect(JSON.stringify(result)).not.toContain("catalog-private-test");
  const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as { variables: { channel: string } }; expect(payload.variables.channel).toBe("fashion-us");
  const foreign = product(); foreign.channelListings = [listing("jewelry-us")]; fetcher.mockResolvedValue(Response.json({ data: { products: { pageInfo: { hasNextPage: false }, edges: [{ node: foreign }] } } }));
  await expect(readCatalogAudit("fashion", viewer)).rejects.toThrow("scope_mismatch");
});
it("fails partial GraphQL and network errors without inventing a valid empty inventory", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ errors: [{ message: "permission denied" }], data: { products: null } })));
  await expect(readCatalogAudit("fashion", viewer)).rejects.toThrow("source_unavailable");
});
