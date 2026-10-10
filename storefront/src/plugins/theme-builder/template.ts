/**
 * Version 1 of the persisted homepage composition.
 * Puck owns ordering and editing, while Saleor continues to own all commerce data.
 */
export type ThemeBlock = {
  type: "Hero" | "Collection" | "Editorial" | "Story" | "Product";
  props: { id: string; [key: string]: string | number };
};
export type ThemeData = {
  content: ThemeBlock[];
  root: { props: Record<string, never> };
};
export const THEME_SCHEMA_VERSION = 1;
export const FASHION_TEMPLATE: ThemeData = {
  root: { props: {} },
  content: [
    {
      type: "Hero",
      props: {
        id: "fashion-hero",
        eyebrow: "A NEW PERSPECTIVE",
        heading: "The art of effortless style.",
        subheading: "Timeless silhouettes. Thoughtful details. Made to move with you.",
        ctaLabel: "Explore the collection",
        ctaHref: "/products",
        imageUrl: "",
        collectionSlug: "featured-products",
      },
    },
    {
      type: "Collection",
      props: {
        id: "fashion-collection",
        eyebrow: "CURATED FOR YOU",
        heading: "New season essentials",
        intro: "Discover the pieces you will return to again and again.",
        collectionSlug: "featured-products",
        limit: 8,
      },
    },
    {
      type: "Editorial",
      props: {
        id: "fashion-editorial",
        eyebrow: "THE EDIT",
        heading: "Better pieces. Fewer decisions.",
        body: "Everyday comfort, considered proportions and enduring design.",
        imageUrl: "",
        imagePosition: "right",
        ctaLabel: "Shop all styles",
        ctaHref: "/products",
      },
    },
    {
      type: "Story",
      props: {
        id: "fashion-story",
        eyebrow: "OUR PHILOSOPHY",
        heading: "Designed to be worn, not just seen.",
        body: "Good style is personal. Start with what feels like you.",
        tone: "inverse",
        align: "center",
      },
    },
  ],
};

export const BLANK_TEMPLATE: ThemeData = { root: { props: {} }, content: [] };

export function freshTemplate(template: "fashion" | "blank"): ThemeData {
  return structuredClone(template === "fashion" ? FASHION_TEMPLATE : BLANK_TEMPLATE);
}
