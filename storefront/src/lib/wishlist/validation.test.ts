import { describe, expect, it } from "vitest";
import { isValidWishlistProductId, isValidWishlistRecord } from "./validation";

const good = {
  productId: "UHJvZHVjdDox", name: "Sample product",
  href: "/en/us/products/sample",
  image: "https://media.saleor.cloud/example.jpg",
  price: 49.5, currency: "USD", channel: "us",
};

describe("wishlist record validation", () => {
  it("accepts authentic catalog data", () => {
    expect(isValidWishlistRecord(good)).toBe(true);
    expect(isValidWishlistProductId(good.productId)).toBe(true);
  });
  it.each([
    { href: "javascript:alert(1)" }, { href: "//evil.example/link" },
    { href: "/\\evil.example" }, { href: " /en/us/products/sample" },
    { href: "/en/us/products/\r\nbad" },
    { price: Number.NaN }, { price: Number.POSITIVE_INFINITY }, { price: -1 },
    { currency: "usd" }, { currency: "U$D" },
    { productId: "" }, { name: "" }, { channel: "../../../" },
    { image: "javascript:alert(1)" },
  ])("rejects unsafe records %#", (part) => {
    expect(isValidWishlistRecord({ ...good, ...part })).toBe(false);
  });
  it("rejects malformed records", () => {
    expect(isValidWishlistRecord(null)).toBe(false);
    expect(isValidWishlistRecord([])).toBe(false);
    expect(isValidWishlistRecord({ ...good, price: "49" })).toBe(false);
  });
});
