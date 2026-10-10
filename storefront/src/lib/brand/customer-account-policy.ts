/**
 * Shared Saleor customer identities are global, not per Channel. A storefront
 * Channel filter can scope orders, but cannot scope me.addresses, passwords,
 * saved defaults or account mutation side effects. In multi-brand deployments
 * guest checkout and verified order credentials remain available, while the
 * unsafe shared account surfaces are disabled until independent brand identity
 * enforcement has been designed and tested end-to-end.
 *
 * This is a containment gate, NOT completed tenant-scoped customer accounts.
 */
export function sharedCustomerAccountsEnabled(sitesJson: string | undefined): boolean {
  return !sitesJson?.trim();
}

/** Fail before decoding credentials or running any cross-brand account mutation. */
export function customerAccountUnavailableResponse(): Response {
  return Response.json(
    { errors:[{ code:"MULTI_BRAND_ACCOUNT_UNAVAILABLE",
      message:"Customer accounts are unavailable for this storefront. Continue as a guest." }] },
    { status:409, headers:{ "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" } },
  );
}
