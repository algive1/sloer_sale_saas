# Architecture baseline

## Decision

Phase 1 uses:

- Saleor Core 3.23.x as the commerce API.
- Saleor Dashboard from the same 3.23 generation.
- Saleor Paper as the storefront baseline.
- US / English / USD as the first active market.
- Stripe as the first production payment provider.
- Google Merchant Center, GA4 and Google Ads integrations after the checkout baseline is green.

## Boundary

We do **not** fork Saleor Core during phase 1.

Business customization should first use:

1. Paper storefront code.
2. Saleor GraphQL APIs.
3. Saleor Apps.
4. Webhooks.
5. External services.

Forking Saleor Core is reserved for a requirement that cannot be implemented cleanly through those extension points.

## Runtime shape

```
Customer
  |
Cloudflare
  |
Paper / Next.js
  |
Saleor GraphQL API
  |-- PostgreSQL
  |-- Valkey/Redis
  |-- Celery worker
  |-- Object storage
  |
Saleor Dashboard
```

## Environments

### Local
Use the official `saleor-platform` stack for backend dependencies and run Paper separately.

### Staging
Production-like Saleor API, isolated database, Stripe test mode, noindex.

### Production
Paper and Saleor scale independently. Do not deploy the development `saleor-platform` compose file as production infrastructure.

## Non-negotiable storefront rules

Preserve Paper's:

- checkout state model
- auth/session flow
- GraphQL code generation
- cache tags and revalidation
- locale/channel routing
- variant selection logic
- PPR/Suspense boundaries
- upstream migration metadata

Brand work should primarily modify presentation and content layers.
