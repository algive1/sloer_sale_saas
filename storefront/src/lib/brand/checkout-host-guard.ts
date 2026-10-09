import { brandSiteForHost, brandSitesConfigured } from "@/config/brand-sites";

type CheckoutHostVerdict = "allow" | "not-found" | "unavailable";

const CHANNEL_QUERY = `query CheckoutBrandChannel($id: ID!) {
  checkout(id: $id) { channel { slug } }
}`;

/**
 * Checkout IDs are bearer credentials in public Saleor GraphQL.
 *
 * Next's async Server Component may render a 404 inside a streamed 200 HTTP
 * response. On the request boundary, verify the *actual* Saleor Channel
 * before any checkout page HTML or RSC payload can be generated/cached.
 *
 * Called only for /checkout?checkout=... when multi-brand is enabled.
 * Single-site builds pay no additional GraphQL request.
 */
export async function verifyCheckoutHostAtRequestBoundary(
  checkoutId: string,
  host: string | null,
  fetcher: typeof fetch = fetch,
): Promise<CheckoutHostVerdict> {
  if (!brandSitesConfigured()) return "allow";

  const site = brandSiteForHost(host);
  if (!site || !checkoutId || checkoutId.length > 1024) return "not-found";

  const api = process.env.NEXT_PUBLIC_SALEOR_API_URL;
  if (!api) return "unavailable";

  try {
    const response = await fetcher(api, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        query: CHANNEL_QUERY,
        variables: { id: checkoutId },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return "unavailable";

    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("data" in body)) return "unavailable";
    const result = body as { data?: { checkout?: { channel?: { slug?: string } } | null }; errors?: unknown[] };
    if (result.errors?.length) return "not-found";
    const channel = result.data?.checkout?.channel?.slug;
    return channel && site.channels.includes(channel) ? "allow" : "not-found";
  } catch {
    // Never serve a potentially cross-brand checkout if Saleor is down.
    return "unavailable";
  }
}
