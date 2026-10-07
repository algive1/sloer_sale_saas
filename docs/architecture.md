# Architecture baseline

## Decision

This repository is the deployable application source of the commerce stack:

- Saleor Core 3.23.40 under `backend/`.
- Saleor Dashboard 3.23.39 under `dashboard/`.
- Saleor Paper storefront under `storefront/`.
- US / English / USD as the first active market.
- Stripe as the first production payment provider.

PostgreSQL and Valkey/Redis are infrastructure dependencies and stay as maintained upstream container images.

## Customization boundary

Owning the Core source does not mean modifying Core by default. Prefer:

1. Paper storefront code.
2. Saleor GraphQL APIs.
3. Saleor Apps.
4. Webhooks.
5. Project integration services.
6. Direct Core patches only when the requirement cannot be implemented cleanly through the supported extension points.

Any direct `backend/` change should be isolated and documented so upstream upgrades remain reviewable.

## Runtime shape

```
Customer
  |
TLS / reverse proxy
  |
Paper / Next.js (storefront/)
  |
Saleor GraphQL API (backend/)
  |-- PostgreSQL
  |-- Valkey/Redis
  |-- Celery worker (backend/)
  |-- media/object storage
  |
Saleor Dashboard (dashboard/)
```

## Environments

### Local

`docker-compose.yml` builds Storefront, Saleor Core and Dashboard from this repository and starts PostgreSQL, Valkey and Mailpit.

### Staging

Use the production Compose overlay with an isolated database, test payment credentials and noindex.

### Production

Use `docker-compose.yml` plus `docker-compose.prod.yml` or equivalent orchestration. Keep database/cache private, terminate TLS at a reverse proxy, persist database/media volumes and keep off-host backups.

## Non-negotiable storefront rules

Preserve Paper's:

- checkout state model
- auth/session flow
- generated GraphQL artifacts
- cache tags and revalidation
- locale/channel routing
- variant selection logic
- PPR/Suspense boundaries
- upstream migration metadata
