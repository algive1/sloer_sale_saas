# Multi-brand product flows and release acceptance (Option A)

## Product model

**One operator → multiple brand sites → multiple regional markets (Saleor Channels) → locales.**
A brand owns its name, domain, presentation, CMS, store policy, catalog selection,
tracking settings, and brand-specific reports. Channels own regional pricing,
currency, saleable inventory and fulfillment visibility. A language is **not**
another brand or another market. System plugins deploy globally, but their
configuration/data are scoped to brand where appropriate.

Do not call an environment entry a launched website. Do not render a selector
unless its choice changes the underlying server-verified query/write scope.
A "success" toast requires an acknowledged persistence/publish result.

## Merchant journey and acceptance

| Step | Expected product behavior | Current status / required work |
| --- | --- | --- |
| 1. Create brand | Choose brand name, internal ID, visual identity; immediately enters setup state | Platform config is read-only; no safe admin CRUD yet |
| 2. Configure markets | Choose one or more Saleor Channels; one Channel cannot belong to different brands; choose default | Validated in static registry; create/edit needs guarded CRUD |
| 3. Bind domains | Check exact hostname ownership, certificate and ingress; publish only after verification | Static allowlist only; DNS/TLS verification pending |
| 4. Publish catalog | A product appears only in channels where merchant intentionally published it; cross-brand sharing requires explicit owner policy | Saleor Channel publication available; ownership/merchant product UX pending |
| 5. Decorate | From brand card open correct default market and language; choose brand then market then language; guard unsaved draft; never silently edit another brand | Initial navigation, visible scope, safe blank draft and confirmation implemented |
| 6. Release homepage | Draft/save doesn't change online site; publish requires confirmation of brand, market and locale; the live URL is **not** considered verified merely because it exists | Scope key and publish confirmation implemented; end-to-end site verification pending |
| 7. Verify launch | Independently validate DNS, HTTPS, catalog, stock, checkout, payment methods, shipping, privacy/legal and order emails | No automatic readiness check: show 'configured / pending validation', not 'online' |
| 8. Review reporting | Platform summary is explicitly labeled; brand-selected reports return only authorized brand data at **SQL/API** layer, never client-side filtering | Initial brand-only summary available under `/ops/sites/[siteId]` (7 channel-filtered SQL queries). Other analytics dashboards and Saleor order lists remain platform-wide until each read path is scoped. |
| 9. Operate plugins | Global plugin deployed once; each brand can have its own pixel ID, consent policy, reminder sender/rules; no fake installation toggle | Shared plugins present; per-brand configuration and authorized write endpoints pending |

### Release-state proposal

`draft → channel-configured → domain-verified → store-ready → published`.
A failure in a required check downgrades readiness and displays exactly which
prerequisite fails. Publishing a homepage is **not equivalent** to passing
checkout/payment readiness. Platform administrators may inspect all brands;
brand-scoped staff must only see assigned brands/channels.

### Operator site readiness (partial implementation)

Each configured brand links to `/ops/sites/[siteId]/readiness` for a server-read
checklist. It verifies registry/domain entries, storefront Channel exposure,
whether the configured Saleor Channels can be queried (when credentials exist),
the valid locale/market pair, and whether the default homepage has a stored
published revision. It **does not** claim DNS, TLS, shipping, payment, order
emails or upstream tenant authorization are verified. These are shown as
pending independent checks, not green "launched" labels.

Brand performance summary is reachable via `/ops/sites/[siteId]` and uses
server-owned Channel selection. All seven base metrics queries bind the
Channel list in SQL, including session funnel, net revenue, source attribution
and abandoned checkout sessions. The former global overview remains explicitly
labelled platform-wide and is still restricted to platform operators.
A composite `(channel, occurred_at)` index assists brand/time reporting.
Brand-specific realtime, advanced traffic, products, checkout health and order
management views are **not yet** site-scoped, so the application must not show
them as brand-only views.

## Shopper journey and acceptance

1. Enter an exact brand domain. It resolves to a site server-side. Unknown
   hosts and channels belonging to other brands must fail closed, not redirect
   to the first/default merchant.
2. Arrive at the brand's default locale and market; changing currency/region
   changes a **Channel within this brand**. Do not show another brand's Channel
   in the region picker.
3. Browse localized, channel-published catalog. Wishlist is private to this
   brand (both guest and logged-in cloud storage).
4. Guest checkout is first-class. Browser cart cookie, checkout ID and server
   mutation must resolve to the same site/channel. Never reconstruct a cart
   from a foreign-brand checkout ID.
5. Email/password can refer to a shared Saleor customer *identity* under
   Option A; do not represent it as cross-brand Single Sign-On or merge carts,
   order histories or marketing consent. The login/session and stored address
   policy must be reviewed for customer expectations and privacy before launch.
6. "My orders" and receipt details must query current brand's Channel IDs
   **at Saleor**. A buyer with 101+ orders still finds an older order directly.
   An order ID, signed link or email verification is not permission to view a
   transaction through another brand's website.
7. Order confirmation, payment errors and delivery emails carry the original
   brand identity and domain and never refer to a different merchant.

## Security and performance

- Shared Saleor Core does **not** create tenant-isolated customer identities or
  checkout capabilities automatically. Strict upstream authorization remains a
  release gate. Frontend Host checks do not replace API authorization.
- Avoid a database read for brand lookup on hot traffic routes; validate/cache
  domain/channel mapping. Read brand-scoped analytics directly in SQL and add
  indices for the actual `site_id` + time query patterns.
- Never aggregate sessions, refunds, orders or ad conversions across brands
  accidentally. The platform overview may sum sites only when labeled and
  only with the correct role.
- Test two unrelated hostnames, two brands, three Channels (two in same brand),
  same email, cross-domain links, invalid scopes, locale switch, guest checkout,
  order history past 100 entries, data analytics and failed publish.

## Items deliberately not faked

- No "add brand" button until domain and Channel ownership can be stored,
  authorized and applied atomically.
- No "domain active" badge based solely on `STOREFRONT_SITES_JSON`.
- No per-brand analytics selector until every backing query is brand-filtered.
- No shared ad pixel in multi-brand mode until per-brand delivery credentials
  and consent isolation exist.

This document is the product acceptance contract, **not proof of completion**.
