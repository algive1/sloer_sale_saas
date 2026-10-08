# sloer_sale_saas

Self-hosted cross-border B2C commerce monorepo based on Saleor.

## Full-stack source layout

This repository is intended to contain the complete application source needed to build the commerce stack on your own server:

```
storefront/      Saleor Paper / Next.js storefront source
backend/         Saleor Core 3.23.40 source
dashboard/       Saleor Dashboard 3.23.39 source
config/          project Saleor configuration and fixtures
infra/           deployment overrides and infrastructure notes
scripts/         bootstrap, deployment and maintenance scripts
docs/            architecture and product decisions
```

PostgreSQL and Valkey/Redis remain infrastructure dependencies and are consumed as upstream container images; their application source is not vendored into this repository.

## Locked baseline

- Saleor Core: **3.23.40**
- Saleor Dashboard: **3.23.39**
- Paper storefront: pinned upstream source under `storefront/`
- Next.js: **16.3.8**
- Node.js: **24.x**
- pnpm: **10.28.1**
- Phase 1 market: **US / English / USD**

Exact upstream commits are recorded in [docs/upstream.md](docs/upstream.md).

## Local full-stack startup

Requirements: Docker with Compose v2.

```bash
cp .env.example .env
bash scripts/bootstrap-local.sh
```

The first start builds Saleor Core, Dashboard and Storefront from the source directories in this repository.

Local endpoints:

- Storefront: http://localhost:3000
- Saleor GraphQL: http://localhost:8000/graphql/
- Saleor Dashboard: http://localhost:9000/
- Mailpit: http://localhost:8025

Create an administrator when needed:

```bash
docker compose run --rm api python3 manage.py createsuperuser
```

## Self-hosted production

Copy the repository to the server, configure `.env`, then run:

```bash
bash scripts/deploy.sh
```

The production Compose file builds these application images from local source:

- `./backend` -> Saleor API and Celery worker
- `./dashboard` -> Saleor Dashboard
- `./storefront` -> Paper / Next.js storefront

PostgreSQL and Valkey are private Compose services. Put TLS/reverse proxying (Nginx, Caddy, Traefik or Cloudflare Tunnel) in front of ports 3000, 8000 and 9000. See [docs/self-hosting.md](docs/self-hosting.md).

## Architecture rule

The repository owns a copy of the Saleor Core source for reproducible self-hosting, but project-specific business features should still prefer GraphQL APIs, Saleor Apps, webhooks and separate integration services. Modify `backend/` itself only when a requirement cannot be implemented cleanly through supported extension points.

## System-wide business plugins

Custom features are available platform-wide. Store data isolation is separate from
plugin availability. The Puck theme builder and payment reminders are now system
modules; analytics, advertising and SEO remain active while awaiting migration.
See [docs/system-plugins.md](docs/system-plugins.md).

## Transaction milestone

```
PLP -> PDP -> variant -> cart -> guest checkout
    -> shipping -> payment -> Saleor order
```

Do not commit credentials. Keep production secrets only in `.env` or an external secret manager.
