#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/.vendor"
SALEOR_PLATFORM_DIR="$VENDOR_DIR/saleor-platform"

mkdir -p "$VENDOR_DIR"

if [ ! -d "$SALEOR_PLATFORM_DIR/.git" ]; then
  git clone --depth 1 https://github.com/saleor/saleor-platform.git "$SALEOR_PLATFORM_DIR"
fi

echo
echo "Saleor platform is available at:"
echo "  $SALEOR_PLATFORM_DIR"
echo
echo "Next steps:"
echo "  1. cd \"$SALEOR_PLATFORM_DIR\""
echo "  2. docker compose run --rm api python3 manage.py migrate"
echo "  3. docker compose run --rm api python3 manage.py populatedb --createsuperuser"
echo "  4. docker compose up"
echo
echo "The storefront source will live in this repository and connect to:"
echo "  http://localhost:8000/graphql/"
