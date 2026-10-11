import { PermissionEnum } from "@dashboard/graphql";

import { type SidebarMenuItem } from "./types";
import { filterSidebarMenu } from "./filterSidebarMenu";

const allowed = new Set([PermissionEnum.MANAGE_PAGES]);
const canSee = (item: SidebarMenuItem) =>
  !item.permissions?.length || item.permissions.some(permission => allowed.has(permission));

describe("nested Saleor navigation permission filtering", () => {
  it("filters grandchildren under a translated group, not only direct children", () => {
    const tree: SidebarMenuItem[] = [{
      id: "store",
      type: "itemGroup",
      url: "/pages",
      permissions: [PermissionEnum.MANAGE_PAGES],
      children: [{
        id: "extensions",
        type: "itemGroup",
        url: "/pages/extensions",
        children: [
          { id: "allowed", type: "item", url: "/pages/a", permissions: [PermissionEnum.MANAGE_PAGES] },
          { id: "denied", type: "item", url: "/pages/b", permissions: [PermissionEnum.MANAGE_STAFF] },
        ],
      }],
    }];

    const result = filterSidebarMenu(tree, canSee);

    expect(result[0].children?.[0].children?.map(item => item.id)).toEqual(["allowed"]);
    expect(result[0].children?.[0].type).toBe("itemGroup");
  });

  it("keeps a navigable landing page when a group's children are forbidden", () => {
    const result = filterSidebarMenu([{
      id: "native-translation",
      type: "itemGroup",
      url: "/translations",
      children: [{
        id: "restricted-app",
        type: "item",
        url: "/extensions/secret",
        permissions: [PermissionEnum.MANAGE_STAFF],
      }],
    }], canSee);

    expect(result).toEqual([{
      id: "native-translation",
      type: "item",
      url: "/translations",
      children: undefined,
    }]);
  });

  it("omits empty non-navigable groups and preserves unrelated native pages", () => {
    const result = filterSidebarMenu([
      {
        id: "restricted",
        type: "itemGroup",
        children: [{ id: "hidden", type: "item", permissions: [PermissionEnum.MANAGE_STAFF] }],
      },
      { id: "orders", type: "item", url: "/orders" },
    ], canSee);

    expect(result.map(item => item.id)).toEqual(["orders"]);
  });
});
