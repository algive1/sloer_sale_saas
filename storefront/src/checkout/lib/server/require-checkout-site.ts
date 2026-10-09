import "server-only";
import { brandSitesConfigured } from "@/config/brand-sites";
import { fetchCheckoutOnServer } from "@/checkout/lib/server/fetch-checkout";

/**
 * The checkout token is a Saleor credential, not proof of brand ownership.
 * In multi-brand mode, verify its *live* Saleor channel before any mutation.
 * Existing single-brand actions incur no extra GraphQL requests.
 */
export async function requireCheckoutForCurrentHost(checkoutId: string): Promise<void> {
  if (!brandSitesConfigured()) return;
  if (typeof checkoutId !== "string" || checkoutId.length < 1 || checkoutId.length > 1024) {
    throw new Error("Checkout not available for this storefront");
  }
  const live = await fetchCheckoutOnServer(checkoutId);
  if (!live.ok || !live.checkout) {
    throw new Error("Checkout not available for this storefront");
  }
}

export async function requireCheckoutVariablesForCurrentHost(variables: unknown): Promise<void> {
  if (!brandSitesConfigured()) return;
  if (!variables || typeof variables !== "object") {
    throw new Error("Missing checkout ID for storefront authorization");
  }
  const record = variables as Record<string, unknown>;
  const checkoutId = record.checkoutId ?? record.id;
  if (typeof checkoutId !== "string") {
    throw new Error("Missing checkout ID for storefront authorization");
  }
  await requireCheckoutForCurrentHost(checkoutId);
}
