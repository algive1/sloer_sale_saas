#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_REF="ee79049fd27d8091ab897ea3ed8145df0b3c9ae7"
DASHBOARD_REF="bc75e988da0fa4fbc3d47378a888d859d070746f"

download_and_extract() {
  local repo="$1"
  local ref="$2"
  local target="$3"
  local url="https://codeload.github.com/saleor/${repo}/tar.gz/${ref}"

  rm -rf "$target"
  mkdir -p "$target"
  curl --fail --location --retry 4 --retry-delay 2 "$url" |
    tar -xz --strip-components=1 -C "$target"
}

cd "$ROOT_DIR"

echo "Vendoring Saleor Core @ $CORE_REF"
download_and_extract "saleor" "$CORE_REF" "backend"

echo "Vendoring Saleor Dashboard @ $DASHBOARD_REF"
download_and_extract "saleor-dashboard" "$DASHBOARD_REF" "dashboard"

printf '%s\n' "$CORE_REF" > backend/.upstream-sha
printf '%s\n' "$DASHBOARD_REF" > dashboard/.upstream-sha

echo "Vendored backend/ and dashboard/ successfully."
