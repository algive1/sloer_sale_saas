# System-level business extensions (V1)

## Non-negotiable boundaries

- Install an extension once per platform. Every store can use it; no per-store installation or activation matrix.
- Plugin availability is not data authorization. Every merchant-data read/write must use the existing verified site identity and correct Saleor channel.
- Reuse Saleor/Paper products, SKU, order, checkout, authentication, payments and permissions. Official Saleor Apps use their own Manifest, GraphQL and webhooks; the internal registry here does not replace an App Manifest.
- A static typed registry eliminates database lookups and dynamic user code execution on shopping requests.

## Current extensions

| ID | Scope | Integration |
| --- | --- | --- |
| theme-builder | system/all stores | `storefront-module`: schema/editor/storage moved to `storefront/src/plugins/theme-builder` and published renderer loaded on demand |
| analytics | system/all stores | `partial`: first-party ingest/storage, dashboard report calculations moved to `storefront/src/plugins/analytics`, while storefront event emitters, app routes and UI remain in Paper |
| ads-tracking | system/all stores | `partial`: browser/server delivery logic, pixel and GA4 config live in `storefront/src/plugins/ads-tracking`; consent state, event projections, browser mount and routes remain integrated with Paper |
| payment-reminders | system/all stores | `storefront-module`: rule/send logic under `storefront/src/plugins/payment-reminders`, existing API routes preserved |
| customer-support | system/all stores | `storefront-module`: optional per-brand Chatwoot CE website SDK mounted on click; no Saleor order/customer API access in phase 1 |
| ai-translations | system/all stores | `partial`: operator-only AI draft generator and create-only Saleor fixture export; no shopper path or live admin UI |
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

## Navigation audit after PR #23

The default Paper homepage editorial CTA now targets its actual featured Saleor
collection (`/collections/<configured-slug>`) rather than a missing `/collections`
index. Footer fallback menus no longer advertise sample marketing pages that are
not implemented. The fallback instead links only to existing shop/account/order
routes; real Support/About/FAQ pages remain possible through Saleor menu items
and CMS Pages.

The Privacy Policy and Terms of Service footer links are emitted only when
`STOREFRONT_PRIVACY_PAGE_SLUG` / `STOREFRONT_TERMS_PAGE_SLUG` are configured.
Each must be a **published, validated, merchant-written Saleor Page**. This is a
**production launch blocker**, not an invitation to insert boilerplate legal
text. A populated slug with no corresponding Page can still return 404; validate
it before switching to production. There is no additional per-request SQL lookup
or plugin registry discovery to render these URLs.

## Deployment pause contract (A23, first lifecycle batch)

`SYSTEM_PLUGINS_DISABLED` is a server-only JSON array. Supported IDs are
`theme-builder`, `payment-reminders`, `customer-support`, `ai-translations`.
Blank / `[]` preserves the existing default. It is system-wide, not a brand
permission or per-store activation setting. Unknown IDs (including the three
modules not yet covered), duplicates, malformed JSON and oversized values pause
all four supported modules. `/ops/plugins` shows this configuration failure
without exposing credentials. Unsupported analytics/ads/SEO are explicitly
labelled **not covered**, rather than falsely reporting stopped.

Update the deployment environment and restart **every** storefront replica with
the same configuration. The shopper extension slots and admin status evaluate
policy after a Next `io()` boundary; rebuilding the application is not required.
The native integration workflow starts a second process using the same production
build with the four modules paused, then verifies authentication, worker responses,
historical rule reads and native catalog rendering.

| Module | Paused behavior | Retained data / boundaries |
| --- | --- | --- |
| theme-builder | Published homepage/PDP extensions fall back to Paper; Ops mutations including AI requests/uploads are rejected after authentication; direct theme/template saves/deletes reject before SQL | Editor/history GET remains available; existing documents/assets remain; no changes to AI provider or image generation business code |
| payment-reminders | Rule changes and manual/automatic sending stop before Saleor, SQL or email provider I/O | Existing rules and delivery history remain readable; no automatic replay of uncertain sends |
| customer-support | New widget mounts stop; signed bot webhooks reject pause before queue insertion; bearer worker endpoint and direct worker stop before heartbeat, claims, SQL/model/Chatwoot calls | Existing conversations remain in Chatwoot and queues remain stored; Chatwoot's independently running native agents are outside this switch |
| ai-translations | Create/review/retry/publish and queue claims stop before SQL/Saleor/model; bearer worker explicitly reports pause | Existing jobs/drafts and exports remain readable; published Saleor translations are retained; standalone offline scripts are outside this server runtime |

The four feature pages include a request-time pause notice; reminder and translation mutation controls are disabled while historical browsing stays available. Theme editor may still display a local unsaved draft, but all server saves/publishes and generation/uploads are blocked.

Ops unauthenticated requests still return 401 and unauthorized brand readers 403;
only authorized mutations return `{error:"plugin_paused"}` with 503/no-store.
Workers retain their bearer-secret authentication and return an explicit 503
`{skipped:true,reason:"plugin_paused"}`. Direct module calls also enforce pause;
UI visibility is not the enforcement mechanism. Invalid configuration uses
`plugin_configuration_invalid`. Pending queue counts are **unknown**, not falsely
reported as zero when storage was not read.

Pause prevents **new** operations. Drain/restart replicas when applying it;
requests already in progress may finish and retain their final audit/claim state.
Resuming allows valid pending work under the existing ownership, age and retry
rules. Pause is neither uninstall nor data rollback. It does not remove third-party
scripts from already open tabs; reload shopper tabs after rollout. Native Core,
products, carts, checkout and payment callbacks are not disabled. Changes to this
configuration invalidate existing launch evidence via the readiness config digest.

Still pending for A23: analytics/browser/server ads collection pause (including
consent and PPR behavior), separating merchant-feed from baseline SEO, versioned
module/database migration compatibility contracts and a tested rollback procedure.
This static registry is not an official Saleor App installation manifest.
