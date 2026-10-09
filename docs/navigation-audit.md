# Route, page and navigation audit

This document distinguishes real browser/HTTP validation from static code review. The
full check runs against **vendored Saleor 3.23.40, Paper, the official Dummy Payment
App, real populated catalog, test Hrana persistence and Chromium** in the
`Saleor 3.23.40 source integration` workflow.

## Routes verified by the new navigation E2E

| Area | Pages/behavior | Verification |
| --- | --- | --- |
| Browse | `/en/us`, `/en/us/products`, `/en/us/search` | Live HTTP status and homepage browser check |
| Shopping | `/en/us/cart`, `/en/us/wishlist` | Live HTTP; the existing `checkout-live.spec.ts` also exercises commerce interactions |
| Customer | `/en/us/login`, `/en/us/signup`, `/en/us/account`, addresses, orders, settings | Live HTTP/redirect check; guest account redirects allowed |
| Catalog details | Saleor product from live sitemap, seeded `/en/us/collections/featured-products` | Live HTTP, not fixtures or static mocks |
| Legacy routes | `/en/us/orders`, `/checkout/complete` | Follow redirects, reject 4xx/5xx |
| Order lookup | `/order/find` | Live HTTP; signed order access is covered by checkout E2E |
| Default editorial CTA | `/en/us/collections/featured-products` | Actual browser link href and HTTP destination |
| Footer | All visible same-origin links on the live homepage | HTTP navigation, no missing direct-policy root URLs |
| Operations | Overview, realtime, traffic, checkout, products, reminders, themes, plugin catalog | Authenticated HTTP; unauthorized requests denied |
| Operations SPA | Data overview → System Plugins sidebar link | Actual Chromium click and URL assertion |
| Checkout | Guest → cart → checkout → dummy payment → Saleor order, with analytics | Existing `checkout-live.spec.ts` |
| Puck | Editor → draft → publish → storefront rendering, auth/CAS checks | Existing `theme-builder-live.spec.ts` |
| SEO/Feeds | sitemap and merchant feed | Integration workflow HTTP response and content checks |

## Additional implemented but not fully automated

The route tree also contains categories by slug, localized CMS pages, per-order
authenticated account details, password reset/confirmation APIs, and dynamic guest
order access. Their availability depends on catalog users, tokens, or published
content and cannot be inferred solely from route existence. Native Saleor Dashboard
has its own upstream UI; the current CI builds it but does not click every native
Dashboard screen. Production payment providers, email delivery, webhooks and
multi-store domain routing are also not proven by Dummy Payment App E2E.

## Navigation fixes

1. Original Paper fallback homepage linked `/collections` even though no collection
   index route exists. The editorial CTA now targets the configured featured collection.
2. When no Saleor footer menu is published, sample marketing links to missing routes
   such as `/contact`, `/faq`, `/shipping`, `/returns`, `/about`,
   `/sustainability`, `/careers` and `/press` were broken. A functional
   fallback links to existing shopping/account/order routes instead; custom
   Support/About/FAQ menus can still be published in Saleor.
3. Original footer `/privacy` and `/terms` URLs were not Next.js routes.
   Legal footer links now use explicitly configured Saleor CMS page slugs
   `STOREFRONT_PRIVACY_PAGE_SLUG` and `STOREFRONT_TERMS_PAGE_SLUG`.

**Production blocker:** Both real legal pages must be published by the merchant
and checked under each site/channel/locale before launch. If not configured,
the legal links are hidden to avoid misleading 404s; that is not legal compliance.
No synthetic legal policy content is generated. Existing app API paths and
checkout logic are unchanged.

## How to run

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3100 \\
PLAYWRIGHT_THEME_EDITOR_SECRET=<CI-only-secret> \\
pnpm --dir storefront exec playwright test e2e/navigation-live.spec.ts --workers=1
```

The full end-to-end run also requires a working Saleor backend and seeded US
channel/catalog. Pages not listed above require targeted future test fixtures.

## Wishlist data and navigation review

The empty wishlist previously used a relative `../products` URL that escaped
the locale/channel path. It now uses a channel-aware absolute storefront path
and the browser test checks the actual click. Wishlist records now require
bounded, safe internal links, a valid price and currency before cloud/local
storage. Sync skips rewriting identical cloud records. This does not yet solve
shared-database tenant `site_id` isolation across unrelated merchants.

## Public analytics ingestion check (next audit phase)

The browser-facing `POST /api/analytics/events` is limited to behavioural
signals and enforces the configured consent mode at the server. An unauthenticated
visitor can no longer submit `refund_completed` as if it were an authoritative
transaction: that event is accepted only through the separately signed Saleor
webhook `/api/analytics/saleor-order-events`. The event body is read in bounded
32 KB chunks, even when the client omits or lies about Content-Length.

Revenue still includes browser-observed `checkout_completed` as an analytical
signal, not an authoritative proof of paid status. Fulfilment, payment state and
order-reminder eligibility continue to use Saleor. For financially authoritative
net sales reporting, reconcile orders to signed server events / Saleor transaction
records before treating those figures as ledger values. Never claim a shopper's
browser is an authenticated purchase ledger.

New unit tests check permitted signals, forged refunds, consent denied/required/
implied modes, oversized payloads, invalid JSON and disabled analytics storage.
