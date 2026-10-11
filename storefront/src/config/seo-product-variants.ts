/** Explicit Saleor attribute slugs, never guesses from a translated option name. */
export const PRODUCT_GROUP_ATTRIBUTES: Readonly<Record<string, "color" | "size" | "material" | "pattern">> = {
  color: "color", colour: "color", size: "size", "shoe-size": "size", "ring-size": "size",
  material: "material", pattern: "pattern",
};
