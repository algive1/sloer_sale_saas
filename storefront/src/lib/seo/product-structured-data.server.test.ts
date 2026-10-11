import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const reads = vi.hoisted(() => ({ io: vi.fn(async () => undefined), variants: vi.fn() }));
vi.mock("next/cache", () => ({ io: reads.io }));
vi.mock("@/lib/catalog/get-product-data", () => ({ getProductVariantsForPdp: reads.variants }));
import { ProductStructuredData } from "./product-structured-data.server";
import { PDP_VARIANT_CAP } from "@/config/variants";
const props = { productId: "product", slug: "coat", locale: "en", options: { channel: "us", name: "Coat", url: "/en/us/products/coat", variantCount: 2 } };
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("avoids variant queries for over-budget/unknown catalogs and checks the request boundary", async () => {
  const element = await ProductStructuredData({ ...props, options: { ...props.options, variantCount: PDP_VARIANT_CAP + 1 } });
  expect(element?.type).toBe("script"); expect(reads.io).toHaveBeenCalledOnce(); expect(reads.variants).not.toHaveBeenCalled();
});
it("keeps Product fallback on optional variant source failures", async () => {
  reads.variants.mockRejectedValueOnce(new Error("source down")); const element = await ProductStructuredData(props);
  expect((JSON.parse(element!.props.dangerouslySetInnerHTML.__html) as { "@type": string })["@type"]).toBe("Product");
  expect(reads.variants).toHaveBeenCalledWith("coat", "us", "en");
});
it("rejects unknown brand/channel before querying variants", async () => {
  vi.stubEnv("STOREFRONT_SITES_JSON", '[{"id":"fashion","name":"Fashion","domains":["fashion.example"],"channels":["us"],"defaultChannel":"us"}]');
  expect(await ProductStructuredData({ ...props, options: { ...props.options, channel: "foreign" } })).toBeNull(); expect(reads.variants).not.toHaveBeenCalled();
});
