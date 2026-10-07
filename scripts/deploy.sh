#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and set production secrets/URLs first." >&2
  exit 1
fi

if [ ! -f backend/manage.py ] || [ ! -f dashboard/package.json ]; then
  echo "Vendored backend/dashboard source is missing from this checkout." >&2
  exit 1
fi

if grep -Eq '^SALEOR_EMAIL_URL=smtp://mailpit([:/]|$)' .env; then
  echo "Production deployment cannot use Mailpit. Set SALEOR_EMAIL_URL to your real SMTP provider." >&2
  exit 1
fi

if grep -Eq '^ALLOW_DUMMY_PAYMENT=true$|^NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT=trueecho "Building Saleor backend images from repository source..."
"${COMPOSE[@]}" build api worker migrate

echo "Starting database and cache..."
"${COMPOSE[@]}" up -d db cache

echo "Applying Saleor database migrations..."
"${COMPOSE[@]}" run --rm migrate

echo "Starting Saleor API and worker..."
"${COMPOSE[@]}" up -d api worker

echo "Waiting for Saleor GraphQL..."
for attempt in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T api python3 -c     'import json, urllib.request; r=urllib.request.Request("http://127.0.0.1:8000/graphql/", data=json.dumps({"query":"{ shop { name } }"}).encode(), headers={"content-type":"application/json"}); urllib.request.urlopen(r, timeout=5).read()'     >/dev/null 2>&1; then
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    echo "Saleor API did not become ready." >&2
    "${COMPOSE[@]}" logs --tail=200 api db cache >&2 || true
    exit 1
  fi
  sleep 2
done

echo "Building Dashboard and Storefront against the running API..."
"${COMPOSE[@]}" build dashboard storefront

echo "Starting Dashboard and Storefront..."
"${COMPOSE[@]}" up -d dashboard storefront

echo
echo "Deployment started. Verify:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200"
 .env; then
  echo "Note: production Compose forcibly disables Dummy Payment even if local .env enables it."
fi

if [ -z "${SALEOR_RSA_PRIVATE_KEY:-}" ]; then
  RSA_KEY_FILE="${SALEOR_RSA_PRIVATE_KEY_FILE:-.local/secrets/saleor-rsa-private-key.pem}"
  if [ ! -f "$RSA_KEY_FILE" ]; then
    echo "Missing Saleor RSA private key: $RSA_KEY_FILE" >&2
    echo "Generate one with: mkdir -p .local/secrets && openssl genrsa -out .local/secrets/saleor-rsa-private-key.pem 2048" >&2
    exit 1
  fi
  export SALEOR_RSA_PRIVATE_KEY
  SALEOR_RSA_PRIVATE_KEY="$(cat "$RSA_KEY_FILE")"
fi

echo "Building Saleor backend images from repository source..."
"${COMPOSE[@]}" build api worker migrate

echo "Starting database and cache..."
"${COMPOSE[@]}" up -d db cache

echo "Applying Saleor database migrations..."
"${COMPOSE[@]}" run --rm migrate

echo "Starting Saleor API and worker..."
"${COMPOSE[@]}" up -d api worker

echo "Waiting for Saleor GraphQL..."
for attempt in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T api python3 -c     'import json, urllib.request; r=urllib.request.Request("http://127.0.0.1:8000/graphql/", data=json.dumps({"query":"{ shop { name } }"}).encode(), headers={"content-type":"application/json"}); urllib.request.urlopen(r, timeout=5).read()'     >/dev/null 2>&1; then
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    echo "Saleor API did not become ready." >&2
    "${COMPOSE[@]}" logs --tail=200 api db cache >&2 || true
    exit 1
  fi
  sleep 2
done

echo "Building Dashboard and Storefront against the running API..."
"${COMPOSE[@]}" build dashboard storefront

echo "Starting Dashboard and Storefront..."
"${COMPOSE[@]}" up -d dashboard storefront

echo
echo "Deployment started. Verify:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200"
