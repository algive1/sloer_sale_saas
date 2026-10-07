# Upstream strategy

## Locked baseline

- Saleor Core tag: `3.23.40`
- Saleor Core commit: `ee79049fd27d8091ab897ea3ed8145df0b3c9ae7`
- Saleor Dashboard tag: `3.23.39`
- Saleor Dashboard commit: `bc75e988da0fa4fbc3d47378a888d859d070746f`
- Historical saleor-platform reference commit: `ab6315bd59c58b4815175df4c679107ff9695be4`
- Paper upstream commit: `b73bdce3269cceb08feff856af5067d117c79cb6`
- Paper Next.js: `16.3.8`
- Paper Node.js: `24.x`
- Paper pnpm: `10.28.1`

## Core policy

The complete Saleor Core source is vendored under `backend/` so a clone of this repository is sufficient to build the backend on a self-hosted server.

Project functionality should still prefer GraphQL, Apps, webhooks and external integration services. Direct Core patches require a concrete requirement and must be kept upgrade-friendly.

## Dashboard policy

The complete matching Saleor Dashboard source is vendored under `dashboard/`. Keep its upstream version aligned with the Core 3.23 line and validate login, product management and order management after upgrades.

## Paper policy

The complete upstream Paper source is vendored under `storefront/`. Preserve `paper-version.json`, `AGENTS.md`, the Paper skill rules, lockfile and source structure. The imported SHA is recorded in `storefront/.paper-upstream-sha`.

## Upgrade procedure

For Core or Dashboard upgrades:

1. choose and record the exact upstream tag/commit;
2. import the upstream source into the matching directory;
3. review local patches against the upstream diff;
4. rebuild the full Compose stack;
5. run migrations;
6. run storefront checks and browser E2E;
7. validate Dashboard product/order flows;
8. validate checkout/payment webhooks in staging;
9. update this file before merging.
