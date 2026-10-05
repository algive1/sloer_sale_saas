#!/usr/bin/env bash
set -euo pipefail

URL="${SALEOR_API_URL:-http://localhost:8000/graphql/}"
TOKEN="${SALEOR_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "SALEOR_TOKEN is required" >&2
  exit 1
fi

RESPONSE="$(curl --fail --silent --show-error   --header 'Content-Type: application/json'   --header "Authorization: Bearer $TOKEN"   --data '{"query":"query VerifyUsBaseline { channel(slug: \"us\") { slug name currencyCode isActive } products(first: 20, channel: \"us\") { edges { node { slug name variants { sku pricing { price { gross { amount currency } } } } } } } }"}'   "$URL")"

printf '%s\n' "$RESPONSE" > /tmp/us-commerce.json

python3 - <<'PY'
import json
from pathlib import Path

payload = json.loads(Path("/tmp/us-commerce.json").read_text())
if payload.get("errors"):
    raise SystemExit(f"GraphQL errors: {payload['errors']}")

data = payload["data"]
channel = data["channel"]
assert channel, "US channel was not found"
assert channel["slug"] == "us"
assert channel["currencyCode"] == "USD"
assert channel["isActive"] is True

products = [edge["node"] for edge in data["products"]["edges"]]
product = next((p for p in products if p["slug"] == "baseline-everyday-sneaker"), None)
assert product, "Baseline product was not found in US channel"

variants = {v["sku"]: v for v in product["variants"]}
expected = {"DEMO-SNEAKER-BLK-9", "DEMO-SNEAKER-WHT-9"}
assert expected.issubset(variants), f"Missing SKUs: {expected - variants.keys()}"

for sku in expected:
    price = variants[sku]["pricing"]["price"]["gross"]
    assert price["currency"] == "USD", (sku, price)
    assert price["amount"] == 79.0, (sku, price)

print("US commerce baseline verified:")
print(f"  channel: {channel['name']} ({channel['slug']}) {channel['currencyCode']}")
print(f"  product: {product['name']}")
print(f"  SKUs: {', '.join(sorted(expected))}")
PY
