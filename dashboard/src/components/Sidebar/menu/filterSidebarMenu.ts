import { type SidebarMenuItem } from "./types";

/**
 * A nested item can carry its own Saleor permission requirement. The
 * merchant-oriented IA introduces a third level for some native extension
 * groups, so filtering just the first two levels can expose irrelevant links.
 *
 * This is strictly visibility filtering; the API and /ops must still enforce
 * authorization independently. Treat empty accordion groups as ordinary links
 * if they have a landing URL, or omit them otherwise.
 */
export function filterSidebarMenu(
  items: readonly SidebarMenuItem[],
  permitted: (item: SidebarMenuItem) => boolean,
): SidebarMenuItem[] {
  return items.flatMap(item => {
    if (!permitted(item)) return [];

    if (!item.children) return [item];

    const children = filterSidebarMenu(item.children, permitted);

    if (item.type === "itemGroup" && children.length === 0) {
      return item.url ? [{ ...item, type: "item" as const, children: undefined }] : [];
    }

    return [{ ...item, children }];
  });
}
