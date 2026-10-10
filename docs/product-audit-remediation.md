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
