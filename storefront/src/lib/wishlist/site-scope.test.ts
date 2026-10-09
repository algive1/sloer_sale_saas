import { afterEach, describe, expect, it } from "vitest";
import { scopedWishlistOwnerKey, wishlistItemBelongsToSite, wishlistScopeFromHost } from "./site-scope";
import type { WishlistRecord } from "./types";
const siteConfig = JSON.stringify([
  { id: "fashion", name: "Fashion", domains: ["fashion.example"],
    channels: ["fashion-us", "fashion-eu"], defaultChannel: "fashion-us" },
  { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"],
    channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
]);
const item: WishlistRecord = { productId: "gid://saleor/Product/1", name: "Item",
  href: "/en/fashion-us/products/example", price: 9, currency: "USD", channel: "fashion-us" };
afterEach(() => { delete process.env.STOREFRONT_SITES_JSON; });

describe("wishlist isolation per authoritative site", () => {
  it("keeps single-site owner keys unchanged", () => {
    const scope = wishlistScopeFromHost("localhost");
    expect(scope).not.toBeNull();
    expect(scopedWishlistOwnerKey("user:123", scope!)).toBe("user:123");
    expect(wishlistItemBelongsToSite(item, scope!)).toBe(true);
  });
  it("never merges cloud collections across brands even for the same Saleor user", () => {
    process.env.STOREFRONT_SITES_JSON = siteConfig;
    const fashion = wishlistScopeFromHost("fashion.example")!;
    const jewelry = wishlistScopeFromHost("jewelry.example")!;
    expect(scopedWishlistOwnerKey("user:123", fashion)).toBe("site:fashion:user:123");
    expect(scopedWishlistOwnerKey("user:123", jewelry)).toBe("site:jewelry:user:123");
    expect(scopedWishlistOwnerKey("guest:uuid", fashion)).not.toBe(scopedWishlistOwnerKey("guest:uuid", jewelry));
    expect(wishlistItemBelongsToSite(item, fashion)).toBe(true);
    expect(wishlistItemBelongsToSite(item, jewelry)).toBe(false);
    expect(wishlistItemBelongsToSite({ ...item, channel: "fashion-us", href: "/en/jewelry-us/products/forged" }, fashion)).toBe(false);
  });
  it("rejects unknown domains instead of routing to the default tenant", () => {
    process.env.STOREFRONT_SITES_JSON = siteConfig;
    expect(wishlistScopeFromHost("unknown.example")).toBeNull();
    expect(wishlistScopeFromHost("fashion.example, jewelry.example")).toBeNull();
  });
});
