# Self-hosting

The repository is designed so the application layer can be built entirely from source checked into this repository.

## What is built locally

- `storefront/`: Paper / Next.js
- `backend/`: Saleor Core 3.23.40
- `dashboard/`: Saleor Dashboard 3.23.39
- `worker`: same `backend/` image, different command

PostgreSQL and Valkey use maintained upstream images because they are infrastructure dependencies rather than project application code.

## Minimum server

For a small staging or early production store, use a Linux server with Docker Compose v2, at least 4 vCPU, 8 GB RAM plus swap, and SSD storage. Because this repository builds Saleor Core, Dashboard and Next.js from source on the server, **16 GB RAM is the safer target for comfortable rebuilds**. Larger catalogs, image processing, imports and traffic bursts may require more CPU/RAM and managed database/object storage.

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
- `SALEOR_ALLOWED_CLIENT_HOSTS` (the customer-facing storefront hostnames Saleor may redirect to)
- `SALEOR_PUBLIC_URL` (for example `https://api.example.com/`)
- `SALEOR_EMAIL_URL` pointing to a real SMTP provider

Production Compose runs Saleor with `DEBUG=False`, enables Saleor's HTTP IP filter, and forcibly disables Dummy Payment. Mailpit is local-only.

Generate a persistent RSA key for Saleor JWT signing before the first production deployment:

```bash
mkdir -p .local/secrets
openssl genrsa -out .local/secrets/saleor-rsa-private-key.pem 2048
chmod 600 .local/secrets/saleor-rsa-private-key.pem
```

Keep the key stable across deployments. The default deploy script reads it from
`.local/secrets/saleor-rsa-private-key.pem`; set `SALEOR_RSA_PRIVATE_KEY_FILE`
if you store it elsewhere, or inject `SALEOR_RSA_PRIVATE_KEY` from a secret manager.

Use HTTPS public URLs in production.

Production upgrades run isolated database/migration/build rehearsal and a final
backup/restore gate. Read [release recovery](release-recovery.md), keep encrypted
off-host backups and retain old images. Configured external databases, Chatwoot
and cloud media require backup/restore receipts. Use `bash scripts/deploy.sh
--preflight-only` before a maintenance window.

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
SALEOR_ALLOWED_CLIENT_HOSTS=www.example.com
SALEOR_PUBLIC_URL=https://api.example.com/
SALEOR_EMAIL_URL=smtp://USER:PASSWORD@smtp.example.com:587/?tls=True
```

The storefront container receives `SALEOR_INTERNAL_API_URL=http://api:8000/graphql/`
at runtime while browsers use the public API URL. The deploy runner overrides
`SALEOR_BUILD_API_URL` with a loopback-only API backed by an isolated migrated
copy, so Dashboard and Storefront finish building before production migrations.
Production application images are started by exact image ID without a rebuild.

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
