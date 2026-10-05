#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:8000/graphql/}"
ATTEMPTS="${SALEOR_WAIT_ATTEMPTS:-60}"

for ((i=1; i<=ATTEMPTS; i++)); do
  if curl --fail --silent --show-error     --header 'Content-Type: application/json'     --data '{"query":"query Health { shop { name } }"}'     "$URL" >/tmp/saleor-health.json 2>/dev/null; then
    echo "Saleor GraphQL is ready at $URL"
    cat /tmp/saleor-health.json
    exit 0
  fi

  echo "Waiting for Saleor GraphQL ($i/$ATTEMPTS)..."
  sleep 2
done

echo "Saleor GraphQL did not become ready: $URL" >&2
exit 1
