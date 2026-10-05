# Upstream strategy

## Saleor Core

Use an official stable Saleor 3.23.x release in phase 1. Do not vendor or fork the Saleor Core source until a concrete extension requirement justifies it.

## Saleor Dashboard

Keep the Dashboard in the same Saleor generation as the backend.

## Paper storefront

Paper is the storefront source we intend to customize and own in this repository.

When importing Paper:

1. Record the exact upstream commit SHA.
2. Preserve `paper-version.json`.
3. Preserve `AGENTS.md` and the Paper skill/rule files.
4. Keep the upstream remote available for future migration comparison.
5. Avoid rewriting checkout, cache/revalidation, i18n/channel routing or generated GraphQL layers during the first visual pass.

## Update policy

Never track an unpinned development branch in production.

Before an upstream Paper update:

1. Review upstream migrations.
2. Apply to staging.
3. Run typecheck, lint, unit tests and checkout E2E.
4. Verify US channel routing and pricing.
5. Verify Stripe test checkout.
6. Merge only after the baseline remains green.
