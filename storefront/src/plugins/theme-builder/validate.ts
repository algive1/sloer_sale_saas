import { THEME_SCHEMA_VERSION, type ThemeBlock, type ThemeData } from "./template";

const MAX_BLOCKS = 60;
const MAX_BYTES = 120_000;
const FIELDS = {
  Hero: ["eyebrow", "heading", "subheading", "ctaLabel", "ctaHref", "imageUrl", "collectionSlug"],
  Collection: ["eyebrow", "heading", "intro", "collectionSlug", "limit"],
  Editorial: ["eyebrow", "heading", "body", "imageUrl", "imagePosition", "ctaLabel", "ctaHref"],
  Story: ["eyebrow", "heading", "body", "tone", "align"],
} as const;

export class ThemeValidationError extends Error {}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
function stringField(input: unknown, limit = 1200): string {
  if (typeof input !== "string" || input.length > limit) throw new ThemeValidationError("Invalid text field");
  return input;
}
function validateField(field: string, value: unknown): string | number {
  if (field === "limit") {
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 24) {
      throw new ThemeValidationError("Collection limit must be between 1 and 24");
    }
    return value as number;
  }
  const text = stringField(value, field === "body" ? 4000 : 1200);
  if (field === "ctaHref" && text && (!text.startsWith("/") || text.startsWith("//") || text.includes("\\") || /[\u0000-\u001f]/.test(text))) {
    throw new ThemeValidationError("Links must be same-site absolute paths");
  }
  if (field === "imageUrl" && text && (!/^https:\/\/[\w.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(text) || text.includes("@"))) {
    throw new ThemeValidationError("Images must use valid HTTPS URLs");
  }
  if (field === "collectionSlug" && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(text)) {
    throw new ThemeValidationError("Invalid Saleor collection slug");
  }
  if (field === "imagePosition" && !["left", "right"].includes(text)) throw new ThemeValidationError("Invalid image position");
  if (field === "tone" && !["default", "muted", "inverse"].includes(text)) throw new ThemeValidationError("Invalid section tone");
  if (field === "align" && !["left", "center"].includes(text)) throw new ThemeValidationError("Invalid alignment");
  return text;
}

/** Validate untrusted editor JSON before storage and before public rendering. */
export function validateThemeData(input: unknown): ThemeData {
  if (!isRecord(input) || !Array.isArray(input.content) || input.content.length > MAX_BLOCKS) {
    throw new ThemeValidationError("Invalid theme document");
  }
  if (JSON.stringify(input).length > MAX_BYTES) throw new ThemeValidationError("Theme exceeds size limit");
  const seenIds = new Set<string>();
  const content: ThemeBlock[] = input.content.map((block: unknown) => {
    if (!isRecord(block) || !isRecord(block.props) || !Object.hasOwn(FIELDS, String(block.type))) {
      throw new ThemeValidationError("Unknown component");
    }
    const type = block.type as ThemeBlock["type"];
    const id = stringField(block.props.id, 100);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || seenIds.has(id)) {
      throw new ThemeValidationError("Invalid or repeated block ID");
    }
    seenIds.add(id);
    const props: ThemeBlock["props"] = { id };
    for (const field of FIELDS[type]) {
      const value = block.props[field];
      if (value !== undefined) props[field] = validateField(field, value);
    }
    return { type, props };
  });
  return { content, root: { props: {} } };
}

export function serializeTheme(input: unknown): string {
  return JSON.stringify({ version: THEME_SCHEMA_VERSION, data: validateThemeData(input) });
}
export function parseTheme(serialized: unknown): ThemeData | null {
  if (typeof serialized !== "string" || !serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== THEME_SCHEMA_VERSION) return null;
    return validateThemeData(value.data);
  } catch {
    return null;
  }
}
