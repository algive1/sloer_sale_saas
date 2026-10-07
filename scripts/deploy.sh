#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set production secrets/URLs first." >&2
  exit 1
fi

if [ ! -f backend/manage.py ] || [ ! -f dashboard/package.json ]; then
  echo "Vendored backend/dashboard source is missing from this checkout." >&2
  exit 1
fi

echo "Building application images from repository source..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

echo "Starting database and cache..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d db cache

echo "Applying Saleor database migrations..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate

echo "Starting application services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api worker dashboard storefront

echo
echo "Deployment started. Verify:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200"
