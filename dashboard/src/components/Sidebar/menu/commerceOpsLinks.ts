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

    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
        url.username || url.password || url.search || url.hash ||
        url.pathname !== "/") {
      return null;
    }

    return url.origin + path;
  } catch {
    return null;
  }
}
