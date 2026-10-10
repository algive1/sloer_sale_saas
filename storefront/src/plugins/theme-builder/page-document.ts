import { validateThemeData, ThemeValidationError } from "./validate";
import type { ThemeData } from "./template";

/**
 * Page scope is separate from the Puck document. This is the future AI/edit
 * extension boundary: proposals must become validated documents before save.
 * Only the product type is enabled in PR 2.
 */
export type ThemePageType = "product" | "collection" | "landing";
export const DEFAULT_PAGE_TEMPLATE_KEY = "default";
export const ENABLED_PAGE_TYPES: readonly ThemePageType[] = ["product"];

const PRODUCT_CONTENT_BLOCKS = new Set(["Collection", "Editorial", "Story", "Product", "Faq"]);

export function isEditableThemePageType(value: string): value is ThemePageType {
  return ENABLED_PAGE_TYPES.some((type) => type === value);
}

export function validatePageTemplateKey(key: string): string {
  // Reserving a template key now prevents future per-product template collisions.
  // Explicit product-specific template assignment is a separate phase.
  if (key !== DEFAULT_PAGE_TEMPLATE_KEY) {
    throw new ThemeValidationError("Only the default page template is available");
  }
  return key;
}

export function validatePageThemeDocument(pageType: ThemePageType, input: unknown): ThemeData {
  if (pageType !== "product") {
    throw new ThemeValidationError("This page type is not enabled");
  }
  const document = validateThemeData(input);
  for (const block of document.content) {
    if (!PRODUCT_CONTENT_BLOCKS.has(block.type)) {
      throw new ThemeValidationError("This block is not allowed beneath the product purchase area");
    }
  }
  return document;
}

/** A merchant can author content BELOW core product details; transaction UI is never part of this document. */
export const PRODUCT_DETAIL_TEMPLATE: ThemeData = {
  root: { props: {} },
  content: [
    {
      type: "Story",
      props: {
        id: "product-brand-story",
        eyebrow: "THE DETAILS",
        heading: "Made for the moments that matter.",
        body: "Thoughtful design, considered materials and an effortless everyday feel.",
        tone: "default",
        align: "center",
      },
    },
    {
      type: "Collection",
      props: {
        id: "product-recommendations",
        eyebrow: "DISCOVER MORE",
        heading: "You might also like",
        intro: "Explore more pieces from the collection.",
        collectionSlug: "featured-products",
        limit: 4,
      },
    },
  ],
};
