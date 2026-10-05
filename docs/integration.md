# Saleor integration baseline

The integration CI runs Paper against the exact Saleor backend we intend to develop against.

## What the workflow proves

1. Saleor Core `3.23.38` migrations succeed.
2. Saleor's development catalog can be seeded.
3. The project bootstrap creates an active `us` channel using USD.
4. Seed products, variants, collections, warehouses and shipping zones are available to that channel.
5. Paper can generate GraphQL types from the live Saleor schema.
6. TypeScript validation passes against that generated schema.
7. Paper unit tests pass.
8. A production-style Next.js build succeeds for `en/us`.

## US bootstrap

`infra/saleor/bootstrap_us.py` is idempotent and is intended for local development and CI only.

It clones Saleor's seeded channel listings into the project channel:

- channel: `us`
- country: `US`
- currency: `USD`
- locale: `en`

This seed data is not a production catalog. Production product/SKU data must follow `docs/product-model.md`.
