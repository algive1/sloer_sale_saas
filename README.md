# sloer_sale_saas

Cross-border B2C commerce project based on Saleor Core and the Saleor Paper storefront.

## Locked baseline

- Saleor Core: **3.23.38**
- Paper: pinned upstream source under `storefront/`
- Next.js: **16.3.8**
- Node.js: **24.x**
- pnpm: **10.28.1**
- Phase 1 market: **US / English / USD**

First milestone:

```
PLP -> PDP -> variant -> cart -> guest checkout
    -> shipping -> test payment -> Saleor order
```

## Layout

```
storefront/      complete pinned Saleor Paper source
docs/            architecture and product decisions
infra/local/     local Saleor overrides
scripts/         bootstrap and verification commands
.github/         CI and reproducible Paper import
```

## Local setup

Requirements: Docker, Node.js 24 and pnpm 10.28.1.

```bash
pnpm bootstrap:backend
```

Run the Docker commands printed by the script, then:

```bash
pnpm bootstrap:storefront
pnpm dev:storefront
```

Local endpoints:

- Storefront: http://localhost:3000
- Saleor GraphQL: http://localhost:8000/graphql/
- Saleor Dashboard: http://localhost:9000/
- Mailpit: http://localhost:8025

Project storefront defaults live in `storefront/.env.project.example`. Do not commit `storefront/.env.local`.

## Project docs

- [Architecture](docs/architecture.md)
- [Product / SKU model](docs/product-model.md)
- [Phase 1 milestone](docs/phase-1.md)
- [Upstream pins](docs/upstream.md)

## Rules

- Do not fork Saleor Core in phase 1.
- Never commit credentials.
- Preserve Paper checkout, auth, routing, GraphQL generation, cache/revalidation and variant-selection architecture.
- Finish the transaction baseline before major UI redesign.
