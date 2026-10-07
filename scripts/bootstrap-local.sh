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

echo "Building Saleor backend images from repository source..."
docker compose build api worker migrate

echo "Starting PostgreSQL, Valkey and Mailpit..."
docker compose up -d db cache mailpit

echo "Applying Saleor migrations..."
docker compose run --rm migrate

echo "Starting Saleor API and worker..."
docker compose up -d api worker

echo "Waiting for Saleor GraphQL..."
for attempt in $(seq 1 60); do
  if docker compose exec -T api python3 -c     'import json, urllib.request; r=urllib.request.Request("http://127.0.0.1:8000/graphql/", data=json.dumps({"query":"{ shop { name } }"}).encode(), headers={"content-type":"application/json"}); urllib.request.urlopen(r, timeout=5).read()'     >/dev/null 2>&1; then
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    echo "Saleor API did not become ready." >&2
    docker compose logs --tail=200 api db cache >&2 || true
    exit 1
  fi
  sleep 2
done

echo "Building Dashboard and Storefront against the running API..."
docker compose build dashboard storefront

echo "Starting Dashboard and Storefront..."
docker compose up -d dashboard storefront

cat <<'EOF'

Full stack is running:
  Storefront: http://localhost:3000
  GraphQL:    http://localhost:8000/graphql/
  Dashboard:  http://localhost:9000/
  Mailpit:    http://localhost:8025

Create an administrator:
  docker compose run --rm api python3 manage.py createsuperuser
EOF
