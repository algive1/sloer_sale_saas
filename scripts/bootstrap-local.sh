#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if [ ! -f backend/manage.py ]; then
  echo "backend/ is missing. Run scripts/vendor-upstreams.sh or use a commit containing vendored Saleor Core." >&2
  exit 1
fi

if [ ! -f dashboard/package.json ]; then
  echo "dashboard/ is missing. Run scripts/vendor-upstreams.sh or use a commit containing vendored Saleor Dashboard." >&2
  exit 1
fi

echo "Building Storefront, Saleor Core and Dashboard from repository source..."
docker compose build

echo "Starting PostgreSQL, Valkey and Mailpit..."
docker compose up -d db cache mailpit

echo "Applying Saleor migrations..."
docker compose run --rm migrate

echo "Starting application services..."
docker compose up -d api worker dashboard storefront

cat <<'EOF'

Full stack is running:
  Storefront: http://localhost:3000
  GraphQL:    http://localhost:8000/graphql/
  Dashboard:  http://localhost:9000/
  Mailpit:    http://localhost:8025

Create an administrator:
  docker compose run --rm api python3 manage.py createsuperuser
EOF
