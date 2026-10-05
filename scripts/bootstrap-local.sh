#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/.vendor"
SALEOR_PLATFORM_DIR="$VENDOR_DIR/saleor-platform"
SALEOR_PLATFORM_SHA="ab6315bd59c58b4815175df4c679107ff9695be4"
OVERRIDE_FILE="$ROOT_DIR/infra/local/saleor.override.yml"

mkdir -p "$VENDOR_DIR"

if [ ! -d "$SALEOR_PLATFORM_DIR/.git" ]; then
  git clone --filter=blob:none https://github.com/saleor/saleor-platform.git "$SALEOR_PLATFORM_DIR"
fi

git -C "$SALEOR_PLATFORM_DIR" fetch --depth 1 origin "$SALEOR_PLATFORM_SHA"
git -C "$SALEOR_PLATFORM_DIR" checkout --detach FETCH_HEAD
test "$(git -C "$SALEOR_PLATFORM_DIR" rev-parse HEAD)" = "$SALEOR_PLATFORM_SHA"

echo "Pinned Saleor platform: $SALEOR_PLATFORM_SHA"
echo "Pinned Saleor Core: ghcr.io/saleor/saleor:3.23.38"
echo
echo "Run from $SALEOR_PLATFORM_DIR:"
echo "docker compose -f docker-compose.yml -f \"$OVERRIDE_FILE\" run --rm api python3 manage.py migrate"
echo "docker compose -f docker-compose.yml -f \"$OVERRIDE_FILE\" run --rm api python3 manage.py populatedb --createsuperuser"
echo "docker compose -f docker-compose.yml -f \"$OVERRIDE_FILE\" up"
