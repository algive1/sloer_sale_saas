# Upstream strategy

## Locked baseline

- Saleor Core image: `ghcr.io/saleor/saleor:3.23.38`
- Saleor local platform commit: `ab6315bd59c58b4815175df4c679107ff9695be4`
- Paper upstream commit: `b73bdce3269cceb08feff856af5067d117c79cb6`
- Paper Next.js: `16.3.8`
- Paper Node.js: `24.x`
- Paper pnpm: `10.28.1`

## Core policy

Do not vendor or fork Saleor Core in phase 1. Prefer GraphQL, Saleor Apps and webhooks. A Core fork requires a concrete requirement that cannot be implemented through supported extension points.

## Paper policy

The complete upstream Paper source is vendored under `storefront/`. Preserve `paper-version.json`, `AGENTS.md`, the Paper skill rules, the lockfile and source structure. The imported SHA is recorded in `storefront/.paper-upstream-sha`.

To update Paper, change the pinned SHA in the import workflow, import the full source, review upstream migrations, run CI, then verify US pricing and checkout in staging before merging.
