import type { WishlistRecord } from "./types";
import { isSafeInternalHref } from "@/lib/url/safe-href";

export function isValidWishlistProductId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

/** One bounded trust boundary for API bodies, persisted rows and localStorage. */
export function isValidWishlistRecord(value: unknown): value is WishlistRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<WishlistRecord>;
  if (!isValidWishlistProductId(item.productId)) return false;
  if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 500) return false;
  if (typeof item.href !== "string" || item.href.length > 2048 ||
      item.href !== item.href.trim() || !isSafeInternalHref(item.href) ||
      /[\u0000-\u001f\u007f\\]/.test(item.href)) return false;
  if (typeof item.price !== "number" || !Number.isFinite(item.price) ||
      item.price < 0 || item.price > 1_000_000_000) return false;
  if (typeof item.currency !== "string" || !/^[A-Z]{3}$/.test(item.currency)) return false;
  if (typeof item.channel !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(item.channel)) return false;
  if (item.variantId !== undefined && !isValidWishlistProductId(item.variantId)) return false;
  if (item.image !== undefined &&
      (typeof item.image !== "string" || item.image.length > 2048 ||
      !(isSafeInternalHref(item.image) || /^https?:\/\/[^\s]+$/i.test(item.image)))) return false;
  return true;
}
