import { PermissionEnum } from "@dashboard/graphql";

import { canUseDashboardSearch, DASHBOARD_SEARCH_PERMISSIONS } from "./navigationAccess";

describe("Dashboard search navigation permission", () => {
  it("matches the native Saleor search permission list", () => {
    for (const permission of DASHBOARD_SEARCH_PERMISSIONS) {
      expect(canUseDashboardSearch([permission])).toBe(true);
    }
  });

  it("hides search for unprivileged or anonymous staff", () => {
    expect(canUseDashboardSearch(undefined)).toBe(false);
    expect(canUseDashboardSearch([])).toBe(false);
    expect(canUseDashboardSearch([PermissionEnum.MANAGE_STAFF])).toBe(false);
  });

  it("uses any-of matching rather than requiring every permission", () => {
    expect(canUseDashboardSearch([PermissionEnum.MANAGE_STAFF, PermissionEnum.MANAGE_ORDERS])).toBe(true);
  });
});
