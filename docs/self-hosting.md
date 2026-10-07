# Self-hosting

The repository is designed so the application layer can be built entirely from source checked into this repository.

## What is built locally

- `storefront/`: Paper / Next.js
- `backend/`: Saleor Core 3.23.40
- `dashboard/`: Saleor Dashboard 3.23.39
- `worker`: same `backend/` image, different command

PostgreSQL and Valkey use maintained upstream images because they are infrastructure dependencies rather than project application code.

## Minimum server

For a small staging or early production store, start with a Linux server with Docker Compose v2, 4 vCPU, 8 GB RAM and SSD storage. Larger catalogs, image processing, imports and traffic bursts may require more memory/CPU and managed database/object storage.

## First deployment

```bash
git clone https://github.com/algive1/sloer_sale_saas.git
cd sloer_sale_saas
cp .env.example .env
```

Edit `.env` before continuing. At minimum change:

- `POSTGRES_PASSWORD`
- `SALEOR_SECRET_KEY`
- `NEXT_PUBLIC_SALEOR_API_URL`
- `NEXT_PUBLIC_STOREFRONT_URL`
- `NEXT_PUBLIC_CHECKOUT_URL`
- `DASHBOARD_API_URL`
- `SALEOR_DASHBOARD_URL`
- `SALEOR_ALLOWED_HOSTS`

Use HTTPS public URLs in production.

Then:

```bash
bash scripts/deploy.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api python3 manage.py createsuperuser
```

## Recommended domains

A simple split is:

- `www.example.com` -> storefront:3000
- `api.example.com` -> api:8000
- `admin.example.com` -> dashboard:9000

Set:

```
NEXT_PUBLIC_STOREFRONT_URL=https://www.example.com
NEXT_PUBLIC_CHECKOUT_URL=https://www.example.com
NEXT_PUBLIC_SALEOR_API_URL=https://api.example.com/graphql/
DASHBOARD_API_URL=https://api.example.com/graphql/
SALEOR_DASHBOARD_URL=https://admin.example.com/
SALEOR_ALLOWED_HOSTS=api.example.com,localhost,127.0.0.1,api
```

The storefront container also receives `SALEOR_INTERNAL_API_URL=http://api:8000/graphql/` so server-side rendering can call Saleor over the private Docker network while browsers use the public API URL.

## Reverse proxy and TLS

Use Nginx, Caddy, Traefik or another reverse proxy. Only the reverse proxy should normally expose ports 80/443 publicly. Restrict direct access to database and cache services with the host firewall.

## Backups

Back up at least:

1. PostgreSQL database.
2. Saleor media volume or external object-storage bucket.
3. production `.env` / secret-manager configuration.
4. repository commit currently deployed.

Keep an off-host copy and test restore procedures.

## Upgrades

Do not edit upstream vendor markers manually. Update the exact commits in `scripts/vendor-upstreams.sh`, re-vendor, review upstream changes, run migrations and full E2E before merging.
