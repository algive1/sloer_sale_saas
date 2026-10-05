#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED="b73bdce3269cceb08feff856af5067d117c79cb6"
ACTUAL="$(tr -d '[:space:]' < "$ROOT_DIR/storefront/.paper-upstream-sha")"

test "$ACTUAL" = "$EXPECTED"
grep -q "PAPER_SHA: $EXPECTED" "$ROOT_DIR/.github/workflows/import-paper.yml"
test -f "$ROOT_DIR/storefront/paper-version.json"
test -f "$ROOT_DIR/storefront/AGENTS.md"
test -d "$ROOT_DIR/storefront/skills/saleor-paper-storefront"
test -f "$ROOT_DIR/storefront/pnpm-lock.yaml"

node - "$ROOT_DIR/storefront/package.json" <<'NODE'
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (pkg.engines?.node !== "24.x") throw new Error("Unexpected Paper Node engine");
if (pkg.packageManager !== "pnpm@10.28.1") throw new Error("Unexpected Paper pnpm version");
if (pkg.dependencies?.next !== "16.3.8") throw new Error("Unexpected Paper Next.js version");
NODE

echo "Paper pin verified: $EXPECTED"
