import { commerceOpsNavigation } from "./commerceOpsNavigation";

describe("Commerce Ops navigation registry", () => {
  it("has unique IDs and existing-ops-shaped paths", () => {
    expect(new Set(commerceOpsNavigation.map(entry => entry.id)).size).toBe(commerceOpsNavigation.length);
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
});
