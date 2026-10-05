# sloer_sale_saas

Cross-border B2C commerce project based on Saleor and the Saleor Paper storefront.

## Phase 1 target

Build a production-oriented **US / English / USD** storefront with a complete transaction path before visual redesign.

The first milestone is:

```
PLP -> PDP -> variant -> cart -> guest checkout
    -> shipping -> test payment -> Saleor order
```

## Architecture

- Commerce backend: Saleor Core 3.23.x
- Operations UI: Saleor Dashboard
- Storefront baseline: Saleor Paper
- Frontend: Next.js / React / TypeScript
- Payment: dummy payment locally, then Stripe test mode
- First market: US
- First language: English
- First currency: USD

Saleor Core is **not forked** during phase 1. Prefer GraphQL, Saleor Apps and webhooks for backend extensions.

See:

- [Architecture](docs/architecture.md)
- [Product model](docs/product-model.md)
- [Phase 1 milestone](docs/phase-1.md)
- [Upstream strategy](docs/upstream.md)

## Local backend

Run:

```bash
bash scripts/bootstrap-local.sh
```

The script prepares the official Saleor local development platform under `.vendor/`.

The storefront will connect to:

```
http://localhost:8000/graphql/
```

## Repository rules

- Never commit real `.env` files or credentials.
- Preserve Paper checkout, routing, cache/revalidation and GraphQL architecture unless a change is explicitly justified.
- Finish the transaction baseline before doing the brand/UI redesign.
