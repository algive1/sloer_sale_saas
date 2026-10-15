import { isCommerceOpsPagePath } from "@dashboard/components/CommerceOpsPage/commerceOpsPath";

/**
 * Browser-visible Commerce Ops links. This is navigation only: it does not grant
 * access to the independently authenticated /ops application.
 *
 * Refuse insecure remote and credential-bearing destinations. No user-provided
 * URL or arbitrary path is accepted from Dashboard navigation data.
 */
export function createOpsHref(base: string | undefined, path: `/ops${string}`): string | null {
  if (!base) return null;

  try {
    const url = new URL(base);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      return null;
    }

    return url.origin + path;
  } catch {
    return null;
  }
}

/** Keep Commerce Ops pages inside the authenticated Dashboard shell. */
export function createDashboardOpsPath(
  base: string | undefined,
  path: `/ops${string}`,
): string | null {
  if (!createOpsHref(base, path)) return null;

  return `/commerce-ops?path=${encodeURIComponent(path)}`;
}
/** Match the same embedded destination resolved by CommerceOpsPage. */
export function isDashboardOpsMenuActive(location: string, menuUrl: string): boolean {
  const requestedPath = new URLSearchParams(location.split("?")[1]).get("path");
  const currentPath = isCommerceOpsPagePath(requestedPath) ? requestedPath : "/ops/analytics";
  const targetPath = new URLSearchParams(menuUrl.split("?")[1]).get("path");

  if (!isCommerceOpsPagePath(targetPath)) return false;

  const [currentPage, currentQuery] = currentPath.split("?");
  const [targetPage, targetQuery] = targetPath.split("?");
  const currentPagePath = currentPage.replace(/\/$/, "");
  const targetPagePath = targetPage.replace(/\/$/, "");
  const samePage =
    currentPagePath === targetPagePath ||
    (targetPagePath === "/ops/sites" && currentPagePath.startsWith("/ops/sites/"));

  return (
    samePage &&
    new URLSearchParams(currentQuery).get("pageType") ===
      new URLSearchParams(targetQuery).get("pageType")
  );
}
