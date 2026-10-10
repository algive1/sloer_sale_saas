# Product audit remediation — 2026-10-10

Baseline: `edce62dfabaaaa4e3c9b3b7595aeba94f365b28b` (PR #36).
Audit IDs refer to the product review delivered on 2026-10-10.

## Batch 1: brand facts and outbound reminder safety

| Item | Code change | Remaining acceptance |
| --- | --- | --- |
| A05 | Read the real `brand` attribute; omit unknown manufacturer in PDP JSON-LD and feed | Inspect rendered PDP/feed against live Saleor |
| A06 | Scope Offer/AggregateOffer domain and seller by Channel's configured brand; unknown scope emits no JSON-LD | Two-domain rendered-page acceptance and production cache refresh |
| A04 | Block all global reminder sending in multi-brand mode and explain the restriction to operators | Brand-scoped sender/rules/language/order queries/logs remain to implement |

The changes add no database reads to shopping pages, retain existing checkout
behavior, and do not modify Saleor Core. A04's guard is deliberate containment;
it must not be marked as a completed multi-brand communication workflow.

### Dependency repair and verification

The original frozen installation rejected 11 old lockfile entries with
`ERR_PNPM_TRUST_DOWNGRADE`. This blocker is resolved:

- Checkout now uses the official `typed-document-node` generator already used
  transitively by the storefront. No application imported the removed generated
  URQL hooks; server actions and document exports remain the checkout interface.
- Re-resolved the lockfile under the unchanged `no-downgrade`, minimum-release-age
  and exotic-subdependency policies. The old Relay/fbjs/ua-parser-js chain is gone.
  Existing security overrides are now represented in the lockfile too.
- Pinned React, React DOM and their Node/React types to their prior locked versions
  to prevent unrelated framework upgrades during resolution.
- Corrected Husky installation and hook working directory for this repository's
  `storefront/` subdirectory. Native fallback install scripts remain denied:
  pnpm 10 uses `ignoredBuiltDependencies`, pnpm 11 uses `allowBuilds: false`.
- `pnpm install --frozen-lockfile` now succeeds. Both GraphQL generators and
  TypeScript checking pass against the vendored Saleor schema. Vitest passes
  150 files / 914 tests; native brand safety checks cover 12 cases.
- The first full lint run surfaced 14 errors in existing UI code. Repairs use
  Embla external-store subscriptions, render-time input resets, observable
  shipping-load state, cancelled translation list requests and a narrower
  Chatwoot configuration error boundary. No lint rule was disabled.

The native regression suite is included in `pnpm run verify` and source CI as
`test:brand-safety`. Full `pnpm run verify` passes after the UI fixes (ESLint: 0 errors, 27 existing warnings).
Live backend build, two-domain rendering and browser checkout remain CI gates;
the local environment has no Docker executable. Existing peer-range warnings
remain for auth-sdk/Next and lucide-react/React; these were not upgraded here.

References: [TypedDocumentNode](https://the-guild.dev/graphql/codegen/plugins/typescript/typed-document-node)
and [Husky subdirectory setup](https://typicode.github.io/husky/how-to.html#project-not-in-git-root-directory).

## Batch 4: A01/A02/A15 — shared customer identity containment (PR #40)

In a multi-brand deployment, Saleor Core `User` identities and address books
are global even if storefront order queries filter by Channel. A brand picker or
per-Channel query cannot authorize viewing/changing another brand's customer
profile, default address or password.

This batch blocks global profile/account/login/register/reset operations at
request and server-action boundaries whenever `STOREFRONT_SITES_JSON` is
present. Checkout renders guest-only controls, does not hydrate `me.addresses`
or autoattach a customer and forces `saveAddress=false` for guest checkout.
Server-side checkout ID and order Host validation continue unchanged. For
single-brand deployments, original signed-in behavior remains available.

**This is risk containment, not completion of A01/A02 or SaaS isolation.**
Long-term per-brand member accounts, customer address ownership, Saleor Core
GraphQL permissions, plugin credentials and third-party data boundaries are
still required before commercial multi-tenant use. Guest checkout requires
live full-flow CI. Production payment credentials were not tested here.

## Batch 5: public catalog listing API Host boundary (PR #42)

The shared `/api/listing` JSON route previously validated its requested
Channel against the **union of all Saleor storefront Channels**. A browser on
one brand host could request a different brand's Channel directly, bypassing
page-route and Merchant-feed host validation.

The API now verifies the requested Channel belongs to the configured brand
for the trusted HTTP `Host`, **before channel discovery and catalog/cache
reads**. Foreign Channels and unknown hosts return 404 with `private,
no-store`, including requests that spoof `x-forwarded-host`. Existing
single-brand behavior and the own-brand filtered/sorted/paginated listing
contract are unchanged. Added route unit tests and real two-domain
Playwright regression coverage.

**Remaining:** This protects the Paper BFF endpoint, **not** the public
Saleor GraphQL catalog or checkout API. Direct GraphQL tenant isolation and
customer/shopper identities are still launch blockers.

## Batch 6: Shared Saleor Core GraphQL identity containment (PR #43)

The Paper-only guest-account restriction from PR #40 could be bypassed by a
direct call to public Saleor `/graphql/`. In multi-brand Compose deployments
(`STOREFRONT_SITES_JSON` present), the Saleor API itself now enters
`SALEOR_SHARED_CORE_GUEST_ONLY` mode. Root GraphQL operations carrying
customer JWTs are rejected; anonymous global account/profile/password
mutations, checkout/customer attachment and external auth mutations are
blocked. Customer token create, refresh and verification cannot issue or
validate globally scoped customer sessions. Platform staff GraphQL and
ordinary anonymous catalog/guest checkout remain permitted. The negative
upstream security suite executes against a seeded real Saleor database in CI.

**Still blocked:** public Checkout bearer-ID read/write operations and global
staff/app credential privileges are not isolated by brand. This is temporary
customer identity containment, not complete tenant isolation.

## Next batches

1. Complete live backend build and browser acceptance for the first batch.
2. A01/A02/A15: unify operator identity, action permissions and server-authorized
   brand scope; retain the distinction between own-brand operation and independent
   SaaS tenants. Do not substitute a brand picker for authorization.
3. A03/A07/A08: actual merchant acquiring eligibility, transaction acceptance,
   launch readiness and tested deployment recovery. External merchant credentials
   and production infrastructure must be verified separately.
4. A04/A14/A17: per-brand reminders, ad destinations, and Chatwoot/WhatsApp context.
5. A09–A13/A19–A21: unified operations, safe brand CRUD, catalog publishing,
   multi-page decoration, localization coverage, fulfillment and content quality.
6. A16/A18/A22–A24: reporting definitions, live AI acceptance, privacy/security,
   plugin contracts and measured reliability/performance. A25 external merchant
   commercialization stays deferred until tenant isolation passes.

No audit item is considered production-verified merely because this file or a PR
exists. Each follow-up should record its actual verification and remaining limits.
