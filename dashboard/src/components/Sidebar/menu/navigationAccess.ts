import { PermissionEnum } from "@dashboard/graphql";

export const DASHBOARD_SEARCH_PERMISSIONS: readonly PermissionEnum[] = [
  PermissionEnum.MANAGE_PRODUCTS,
  PermissionEnum.MANAGE_PAGES,
  PermissionEnum.MANAGE_PAGE_TYPES_AND_ATTRIBUTES,
  PermissionEnum.MANAGE_ORDERS,
];

/**
 * The custom topbar must not expose Search to staff whose native Saleor
 * Dashboard search entry is hidden. This is presentation-only permission
 * filtering; Saleor API authorization remains authoritative.
 */
export function canUseDashboardSearch(granted: readonly PermissionEnum[] | undefined): boolean {
  return Boolean(granted?.some(permission => DASHBOARD_SEARCH_PERMISSIONS.includes(permission)));
}
