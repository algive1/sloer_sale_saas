import "server-only";
import { io } from "next/cache";
import { PDP_VARIANT_CAP } from "@/config/variants";
import { getProductVariantsForPdp } from "@/lib/catalog/get-product-data";
import { buildProductGroupJsonLd } from "./product-group";
import { buildProductJsonLd, jsonLdScriptProps } from "./json-ld";

/** Variant payloads stay in a server Suspense island; reuse the picker's cached bounded query. */
export async function ProductStructuredData({ productId, slug, locale, options }: {
  productId: string; slug: string; locale: string; options: Parameters<typeof buildProductJsonLd>[0];
}) {
  await io();
  const fallback = buildProductJsonLd(options); if (!fallback) return null;
  let data: object = fallback;
  if ((options.variantCount ?? 0) > 1 && (options.variantCount ?? 0) <= PDP_VARIANT_CAP) {
    try {
      const matrix = await getProductVariantsForPdp(slug, options.channel, locale);
      if (!matrix.overBudget) data = buildProductGroupJsonLd(options, productId, matrix.variants, matrix.totalCount) ?? fallback;
    } catch {
      // Optional variant SEO never blocks the native product/price/checkout surface.
    }
  }
  return <script {...jsonLdScriptProps(data)} />;
}
