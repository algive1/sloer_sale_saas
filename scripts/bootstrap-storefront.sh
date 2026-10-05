#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STOREFRONT_DIR="$ROOT_DIR/storefront"

test -f "$STOREFRONT_DIR/package.json"
test -f "$STOREFRONT_DIR/.env.project.example"

if [ ! -f "$STOREFRONT_DIR/.env.local" ]; then
  cp "$STOREFRONT_DIR/.env.project.example" "$STOREFRONT_DIR/.env.local"
  echo "Created storefront/.env.local from the project template."
fi

if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@10.28.1 --activate
fi

HUSKY=0 pnpm --dir "$STOREFRONT_DIR" install --frozen-lockfile
echo "Storefront dependencies are installed. Start Saleor, then run: pnpm dev:storefront"
