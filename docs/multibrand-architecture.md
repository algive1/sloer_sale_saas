## Public Saleor GraphQL boundary: still not a tenant gateway

**Upstream containment (PR #43):** When `STOREFRONT_SITES_JSON` is present,
Docker Compose now enables `SALEOR_SHARED_CORE_GUEST_ONLY` inside Saleor
itself. A GraphQL resolver middleware rejects all root operations bearing a
customer JWT (including old single-brand tokens, aliases and fragments), blocks
anonymous global customer account/password/address mutations and checkout
customer attachment, and refuses customer token creation, renewal and
verification. Staff credentials continue to work for the Saleor Dashboard;
anonymous catalog and guest checkout work normally. External auth plugin entry
points are disabled in this mode. The guard is backend-side and cannot be
bypassed simply by skipping Paper or changing an HTTP Host header. Deployments
running Saleor outside the included Compose must set the flag explicitly
wherever the API serves GraphQL. CI exercises the backend directly.

**Important:** This does NOT scope Checkout bearer IDs, global merchant staff
permissions, privileged app tokens or arbitrary guest order/checkout GraphQL
requests to brand domains. It does not deliver independent per-brand accounts.

The self-hosted deployment currently publishes the Saleor GraphQL endpoint
at `NEXT_PUBLIC_SALEOR_API_URL` (and the base Compose maps API port 8000).
Saleor Core customer JWTs, `me`, addresses and account mutations are **global**
to that Core instance. Blocking BFF and storefront routes cannot enforce
per-tenant permissions on direct GraphQL requests, external apps or Dashboard
sessions. Protect public GraphQL using the full upstream authorization policy
and the reverse proxy/ingress controls appropriate for the deployment, rather
than relying on client-side brand routing, CORS or hidden account buttons.
Do not publish a shared-Core multi-brand customer login or enable production
merchant tenancy until the direct GraphQL cross-brand read/write tests pass.
The guest-only storefront containment is temporary and does not make the
upstream API multi-tenant secure.

## Multi-brand wishlist ownership

When shared Saleor Core serves multiple brands, the cloud wishlist is
**guest-owned only**. Each brand maps the host-derived brand ID and a
host-only HttpOnly random guest cookie to a distinct storage namespace.
Even if the request includes a Saleor customer session token, the wishlist
API never queries global `me` or merges guest records into shared Saleor
customer identity. Its personalized GET response is `private, no-store`.
Single-brand stores retain their signed-in wishlist merge behavior. Guest
favorites do not synchronize between devices in multi-brand mode; this is
intentional until per-brand customer identities are available.

## Interim shared-customer identity containment (PR #40)

**Security boundary, not finished tenant isolation:** Saleor Core stores the
customer `me`, shipping address book, default addresses and password once per
customer, not once per Channel. Filtering `me.orders` by Channel does not make
`me.addresses` or `accountUpdate` brand-private.

While `STOREFRONT_SITES_JSON` is configured the Paper storefront therefore
denies `/{locale}/{channel}/login` and `/account/**` at the HTTP request
boundary, denies all five `/api/auth/*` endpoints and refuses profile/address
account actions before calling Saleor. Checkout does **not** hydrate Saleor
global `me.addresses` or attach a logged-in account to a new checkout. Guest
email, shipping/billing address for the current checkout, payment and
cryptographically verified order status remain available. Shipping/billing
updates force `saveAddress=false` to avoid mutating the global address book.
Frontend guest checkout hides login, registration and password reset controls.
The Saleor server-side auth SDK additionally receives a no-op token store on
multi-brand storefronts: stale global access/refresh cookies are neither read
nor forwarded on checkout mutations. The corresponding session-presence check
returns guest, even if a browser still carries cookies from an older single-
brand deployment. These guards are not a proxy in front of direct Saleor API.

The single-brand path is unchanged.

This is a temporary availability trade-off: shoppers cannot sign in, register
or manage saved addresses on **any** brand of the shared-Core deployment.
Do not describe this as independent customer login. Do not expose Saleor
GraphQL directly with public mutation or login permissions that would bypass
Paper's policy. To restore customer accounts, first establish per-brand
identity/authorization in Saleor, including account mutations, login/reset,
checkout ownership, addresses, email templates, refunds and third-party apps,
then run the negative cross-host browser and GraphQL security tests.

## Architecture decision — Option A (approved 2026-10-09)

**Decision:** One self-hosted Saleor Core and one primary operations plane,
with one **exclusive set of Saleor Channels per brand site**. Each brand may
own several channels (e.g. US/EU) to serve its regional markets. System plugins
are deployed once, while site configuration and first-party records must be
scoped by the verified brand.

This matches Saleor's documented Channel capability (regional, brand and
business-model storefronts), while preserving independent public domains and
Puck themes. The app may eventually be served from one Next instance with
Host routing, provided each tenant boundary below is enforced.

**Important limitation:** A Channel is *not a separate Saleor customer tenant*.
Customer account identity remains global, and knowing a Checkout UUID is enough
to access some fields or mutate a checkout through Saleor's public GraphQL
endpoint. Staff order permissions can be restricted by Channel, but global user
identity, browser-direct GraphQL, and cross-brand account order lists are
distinct boundaries.

**Required launch conditions for Option A:**
1. Enforce exclusive Channel-to-brand ownership and test negative Host/channel
   combinations throughout storefront, checkout, cart, order lookup and API.
2. Restrict staff permissions to allowed Channels, reserve all-brand platform
   access for platform administrators, and use API-level authorization for any
   sensitive cross-brand customer information. Don't rely on the page router.
3. Make shopper order lists and order detail lookup brand-scoped at query and
   response boundaries; no unfiltered global account order views.
4. Partition site-specific analytics, pixel credentials, email reminders,
   content, cookies, feeds and canonical URLs, including asynchronous webhooks.
5. Test at least two hosts and two disjoint brand Channels with the same
   customer email, checkout URL and order lookup (positive and negative cases).
6. Keep global ad destinations disabled until per-brand targets are configured,
   tested and confirmed not to cross-report.

**Explicit non-goal:** Do not clone the Saleor Core or fork its data schema
per brand. If an essential upstream identity authorization boundary cannot
be made safe while sharing Core, the affected route/feature must remain
disabled rather than pretending that frontend Channel filtering provides
strong tenant authorization.

# Multi-brand storefront design and rollout

## Terms and non-negotiable rules

- **Brand site**: one merchant-facing identity, hostnames, logo, description,
  legal documents, CMS content, analytics scope and marketing destinations.
- **Saleor Channel**: a market/currency/pricing/stock publication surface.
  One brand can have multiple channels. In the current shared Saleor backend
  the same channel MUST NOT belong to two brands.
- **System plugin**: installed once in code and available to every brand.
  This does not grant access to another brand's data.
- Storefront consumer requests resolve the **real Host** through a static
  allowlist. Site IDs in cookies, event payloads and query params are never
  authoritative. The reverse proxy must overwrite Host and strip untrusted
  forwarded hostname headers; keep its routing and CDN cache host-aware.

## Implemented in the foundation branch

1. `STOREFRONT_SITES_JSON`: strictly validated domains, brand IDs, unique
   Channel ownership, per-brand default Channel, name, description, optional
   logo paths and published legal CMS page slugs.
2. Existing deployments without this variable retain the single-site
   `STOREFRONT_SITE_ID` behavior and original global logo/SEO configuration.
3. Incoming storefront root and localised product pages are constrained by
   the matching brand hostname and its allowed channels; wrong brand host
   returns 404 rather than silently routing to the global default.
4. A second server-side guard checks Host+Channel, not just middleware redirects.
5. Puck theme draft, preview and published documents use the unique
   `site_id/channel/locale` key. The editor identifies the brand when a
   channel is selected; existing revision comparison and storage remain.
6. Per-channel brand metadata, visible wordmark/logo, footer and market
   selector avoid leaking another brand's presentation and channel links.
7. Pure unit tests cover unknown hosts, Host attacks, duplicate assignments,
   bad configuration and separated theme keys.

Example routing (illustration, not actual merchant data):

```json
[
  {
    "id": "brand-fashion",
    "name": "Fashion",
    "description": "A contemporary clothing collection.",
    "domains": ["fashion.example.com", "www.fashion.example.com"],
    "channels": ["fashion-us", "fashion-eu"],
    "defaultChannel": "fashion-us",
    "defaultLocale": "en",
    "logo": "/brands/fashion/logo.svg",
    "logoInverted": "/brands/fashion/logo-white.svg",
    "privacyPageSlug": "fashion-privacy",
    "termsPageSlug": "fashion-terms"
  },
  {
    "id": "brand-jewelry",
    "name": "Jewelry",
    "domains": ["jewelry.example.com"],
    "channels": ["jewelry-us"],
    "defaultChannel": "jewelry-us",
    "defaultLocale": "en"
  }
]
```

Set `STOREFRONT_CHANNELS` to the union of these channels and publish each
channel's catalog in Saleor; the JSON above is not a product permission system.
Brand image paths must point to actual public files supplied by the merchant.
The example does not create real merchant policy pages.

## Still required BEFORE enabling one shared multi-brand instance in production

- **Checkout and orders**: enforce verified site+channel in every route, session,
  cart and order link; decide if cross-brand customer accounts are legally and
  operationally acceptable. Saleor customers are not per-brand tenants by default.
- **Analytics**: migrate event storage, refund deduplication, all report queries,
  session attribution and dashboards to site-scoped keys and filters. Browser
  channel fields are not trusted tenant identities.
- **Payment reminders**: site-scoped reminder rules, order access, job claiming,
  mail sender/domain and templates; validate Saleor order channel and site.
- **Advertising and consent**: independent pixel IDs, access tokens, GA4, site
  attribution and deduplication; never mix visitor/consent identifiers across hosts.
- **SEO and feeds**: site-aware canonical links, robots, sitemap, Merchant Center
  feed, structured data and redirects. The existing public store URL variable
  and some global static metadata are single-domain-oriented.
- **Admin**: central merchant-owned brand switcher, site-specific RBAC when brand
  operators are introduced, all CRUD API reads and writes checked server-side.
  The legacy Basic Auth secret is one platform administrator, not tenant RBAC.
  Optional `OPS_OPERATORS_JSON` now permits separate platform administrators and
  read-only brand analysts on assigned `/ops/sites/:siteId` pages only; it is not
  full tenant RBAC or a credential for Saleor Dashboard. See
  `docs/ops-operator-permissions.md`.
- **Test gate**: two configured hosts, separate channels/products/analytics,
  negative cross-host browsing, cross-brand checkout/account/ops boundaries,
  privacy content, theme publish, webhook and payment E2E, plus production build.

**Do not treat this foundation as production-ready multi-brand isolation.**
One safe short-term option is a separate storefront instance per brand,
reusing the identical repository/plugins but distinct host, environment,
storefront site ID and storage/analytics credentials. This does not by itself
create per-brand Saleor user permissions.

## Performance

Static mapping costs one in-process parse per config change, then O(number of
sites) host/channel lookup; there are no DB reads on browsing requests. For a
large number of sites, index the already-validated in-memory configuration
into host/channel Maps. Avoid per-request plugin discovery and avoid
cross-process mutable caches for published content without invalidation.

## Checkout and wishlist guard increment (still not production-complete)

- Shared libSQL wishlist keys now include the verified `site_id` in multi-brand
  mode for both guest and authenticated owners. Guest→user merging stays within
  the same site. POST rejects a product's foreign Channel and cross-brand
  localized URLs. Existing single-site keys remain unchanged.
- Previously existing single-site wishlist rows are **not** silently migrated
  or exposed to every new brand. Explicit merchant-scoped migration is required
  for continuity when enabling the multi-brand configuration.
- Cart cookie selection only considers Channels of the incoming trusted Host;
  wrong-channel checkout cookies cannot become the default checkout.
- Cart create/read and checkout RSC loading verify host Channel ownership,
  and payment/checkout Server Actions verify the *live Saleor checkout* before
  write mutations. A cross-brand checkout ID is rejected, not silently reused.
- For multi-brand direct checkout requests with a missing or foreign token,
  return an unavailable/not-found response instead of mounting client checkout
  state which might refetch the foreign checkout.

### Remaining high-risk requirements

- The public Saleor GraphQL endpoint may still accept a valid bearer checkout
  ID independently of Paper. Browser-readable credentials and GraphQL must be
  scoped at the backing API/proxy boundary if strict brand confidentiality is
  required. Paper action checks alone do not enforce upstream tenant RBAC.
- Saleor customers are global within this Core instance. Orders, authenticated
  account pages, password flows, refunds, merchant staff and webhook actions
  still require a coherent per-brand authorization/data model.
- Browser/server ad providers and first-party analytics are still configured
  globally. No mixed-brand deployment should be enabled until event tables,
  consent, pixels and cross-brand reports have site-specific configuration.
- Per-host canonical URL, sitemap, Merchant feeds, robots, cache keys and origin
  redirect policies must be verified with two real test domains.
- For high assurance legal/merchant separation, consider one Saleor tenant
  instance per brand behind a unified operations control plane. Sharing one
  Saleor Core with Channel mapping is a convenience, not automatic isolation.
