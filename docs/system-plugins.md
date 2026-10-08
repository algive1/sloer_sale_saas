# System-level business extensions (V1)

## Non-negotiable boundaries

- Install an extension once per platform. Every store can use it; no per-store installation or activation matrix.
- Plugin availability is not data authorization. Every read/write must eventually use a verified site identity plus the correct Saleor channel.
- Reuse Saleor/Paper products, SKU, order, checkout, authentication, payments and permissions. Official Saleor Apps use their own Manifest, GraphQL and webhooks; the internal registry here does not replace an App Manifest.
- A static typed registry eliminates database lookups and dynamic user code execution on shopping requests.

## Current extensions

| ID | Scope | Integration |
| --- | --- | --- |
| theme-builder | system/all stores | `storefront-module`: schema/editor/storage moved to `storefront/src/plugins/theme-builder` and published renderer loaded on demand |
| analytics | system/all stores | `partial`: first-party ingest/storage, dashboard report calculations moved to `storefront/src/plugins/analytics`, while storefront event emitters, app routes and UI remain in Paper |
| ads-tracking | system/all stores | `partial`: browser/server delivery logic, pixel and GA4 config live in `storefront/src/plugins/ads-tracking`; consent state, event projections, browser mount and routes remain integrated with Paper |
| payment-reminders | system/all stores | `storefront-module`: rule/send logic under `storefront/src/plugins/payment-reminders`, existing API routes preserved |
| seo-merchant | system/all stores | `legacy-inline`: original SEO and feed routes remain operational |

Registry: `storefront/src/plugins/system/registry.ts`. Operations can inspect the system-wide catalog at `/ops/plugins` (read-only; no store-specific activation or customer-page I/O). `partial` means server-side business logic was extracted but other code still lives in Paper. `legacy-inline` means the feature is **not yet extracted**. Existing endpoints, schemas and reporting SQL remain unchanged.

## Performance and reliability

1. Do not import the Puck server renderer on the normal Paper homepage; load it only for a validated published document.
2. Do not sequentially invoke all plugins or load plugin config from SQL on product, cart or checkout page views.
3. Fail to the baseline Paper page on an optional theme store outage; never mask core payment/order failures.
4. Preserve event consent, idempotency, attribution and browser/server deduplication when extracting analytics.
5. Use bounded async workers for heavy integrations. Avoid blocking the checkout request on marketing or reporting.
6. Published theme reads still use libSQL when configured. Caching requires distributed invalidation on publish, not an unbounded in-memory map.
7. Measure real latency, DB calls, bundle sizes and Core/Dashboard/Paper upgrade compatibility before accepting performance claims.
8. Analytics extraction changes import ownership only: preserve the existing batched SQL pipelines and cached schema initialization; do not add synchronous calls to plugin metadata or extra database reads.

## Known limitations and next steps

The theme builder and reminders now use the shared libSQL transport at `storefront/src/lib/storage/libsql-http.ts` rather than importing the Analytics transport. Existing Analytics imports still work through a compatibility facade. Self-hosted Compose now injects optional theme storage credentials and `STOREFRONT_SITE_ID`.

The current theme store uses deployment-level `STOREFRONT_SITE_ID + channel + locale`. Shared-host domain-to-site routing and per-site permissions are not implemented here. Existing analytics and reminder queries are not yet reliably site-scoped. Do not assume multi-tenant isolation because a plugin is listed in the registry.

Next: trusted request-scoped site context and site-scoped analytics queries; isolate remaining event projections/consent contracts; complete the Saleor App lifecycle for external services including reminders; implement complete global lifecycle controls only after their routes/workers are gated. Do not add store-specific plugin toggles unless requested.

## Verification

```sh
pnpm --dir storefront install --frozen-lockfile
pnpm --dir storefront generate:all
pnpm --dir storefront exec tsc --noEmit
pnpm --dir storefront exec vitest run src/plugins/system/registry.test.ts src/plugins/theme-builder/entry.server.test.ts src/plugins/theme-builder/store.test.ts src/plugins/theme-builder/validate.test.ts src/plugins/payment-reminders/service.test.ts src/plugins/payment-reminders/policy.test.ts src/plugins/analytics/compatibility.test.ts src/plugins/ads-tracking/config.test.ts src/plugins/ads-tracking/ga4-config.test.ts
```

CI is in `.github/workflows/theme-builder.yml`. A real storefront build and end-to-end checkout/theme publishing still need staging checks.
