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
  The current Basic Auth secret is one platform administrator, not tenant RBAC.
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
