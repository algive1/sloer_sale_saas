import { commerceOpsNavigation } from "./commerceOpsNavigation";

describe("Commerce Ops navigation registry", () => {
  it("has unique IDs and existing-ops-shaped paths", () => {
    expect(new Set(commerceOpsNavigation.map(entry => entry.id)).size).toBe(
      commerceOpsNavigation.length,
    );
    for (const entry of commerceOpsNavigation) {
      expect(entry.path === "/ops" || entry.path.startsWith("/ops/")).toBe(true);
      expect(entry.zh.trim()).not.toBe("");
      expect(entry.en.trim()).not.toBe("");
    }
  });

  it("keeps the Puck product template in the store section", () => {
    expect(commerceOpsNavigation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "store", path: "/ops/themes?pageType=product" }),
      ]),
    );
  });

  it("links system-level plugin navigation directly to its feature pages", () => {
    expect(commerceOpsNavigation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "commerce-ads-tracking",
          path: "/ops/analytics/destinations",
        }),
        expect.objectContaining({ id: "commerce-merchant-feed", path: "/ops/merchant" }),
      ]),
    );
    expect(commerceOpsNavigation.some(entry => entry.path === "/ops/plugins")).toBe(false);
  });

  it("offers a protected configuration center in Settings for each supported staff permission", () => {
    // Arrange
    const configuration = commerceOpsNavigation.find(
      entry => entry.id === "commerce-configuration",
    );

    // Assert
    expect(configuration).toEqual(
      expect.objectContaining({ section: "settings", path: "/ops/settings" }),
    );
    expect(configuration?.permissions).toEqual(
      expect.arrayContaining([
        "MANAGE_ORDERS",
        "MANAGE_PRODUCTS",
        "MANAGE_SETTINGS",
        "MANAGE_PAGES",
        "MANAGE_TRANSLATIONS",
        "MANAGE_APPS",
        "MANAGE_USERS",
      ]),
    );
  });
});
