# Release and recovery gates (A08)

`bash scripts/deploy.sh` now builds backend images first, restores a live
PostgreSQL dump into a randomly named **isolated** Compose project, rehearses
migrations there, starts its private Docker API with no published port and outbound networking disabled,
and builds Dashboard/Paper against that API. A clean source checkout is required.
The Linux build host reaches its private bridge IP directly; an internal network
does not expose a usable published port. No production DDL or application
shutdown occurs before all application images build. Allow additional disk/RAM
for a database copy; copied merchant data is sensitive.

After successful builds the runner pins exact image IDs, stops application and
poller writers, dumps PostgreSQL again, archives local media, copies deployment
configuration/signing keys, verifies the media archive, and actually restores
the final dump in the isolated database. Only then does it migrate production.
API and storefront health checks must pass before the release is marked deployed.
The runner holds an exclusive host-local lock; do not run manual migrations or
another server's deployment against the same database concurrently.

Use `bash scripts/deploy.sh --preflight-only` to rehearse without production DDL.
The preflight project is removed afterwards; production volumes are never removed.
Private manifests, backup checksums, old/new image IDs and the resolved configuration
live in `.local/releases/<id>/`. Keep an encrypted off-host copy and retain the old
images. Do not publish this directory, logs, credentials or copied customer data.

## External state

Paper themes, analytics/reminders and translations may live in libSQL, while
Chatwoot and cloud media live outside this Compose stack. A PostgreSQL dump does
not back them up. When such services are configured, deployment requires an
external receipt via environment variable `RELEASE_EXTERNAL_BACKUP_RECEIPT`:

```json
[
  {
    "service": "analytics",
    "path": "analytics.sqlite",
    "sha256": "actual-file-sha256",
    "capturedAt": "2026-10-11T08:00:00+00:00",
    "restoreVerifiedAt": "2026-10-11T08:05:00+00:00",
    "restoreEvidence": "Private provider restore drill DR-001"
  }
]
```

Supply one entry for every configured `analytics`, `theme`, `translations`,
`chatwoot` and `object-storage` service. Shared libSQL databases may reference the
same snapshot under several service names. Paths are relative to the receipt;
files must exist, match SHA-256, and be at most 24 hours old. libSQL artifacts must
be actual SQLite snapshots and pass `integrity_check`; use the provider's supported
backup/export and restore method. Chatwoot/object-store restoration is attested by
the operator's private evidence; the runner cannot verify cloud-provider recovery
from a local archive alone. The files are copied into the private release backup.

These are separate recovery points, not a distributed transaction. Record the
RPO, pause external writers if consistency is required, and capture a fresh final
snapshot after they stop. A real off-host recovery drill remains required. No
receipt can prove that an unconfigured external service was backed up.

## Failure recovery

- **Before production migration:** failed builds leave existing application
  containers running. If the final backup gate failed after stopping writers,
  the runner starts the existing stopped containers, preserving their old runtime
  configuration and image IDs without rebuilding or pulling application images.
- **After production migration begins:** the runner stops application/poller
  writers and retains the backup. It never runs `pg_restore` on production or
  starts old applications against an unknown new schema automatically.

Put the reverse proxy in maintenance mode and investigate privately. Prefer a
forward repair when possible. For a destructive restore, establish whether any
new orders/payments arrived; reconcile provider transactions first. Restore the
verified archive into a **new** empty database with PostgreSQL 15 `pg_restore
--no-owner --no-privileges --exit-on-error`, check migrations and order/payment
counts, and restore media plus the matching deployment/signing/encryption keys.
Point the old recorded configuration/images at that recovered database only after
validation. Do not overwrite a live database or automatically replay notifications.

Restore external snapshots at the documented recovery points, verify customer
lookup, paid orders, fulfillment/refunds, brand routing, theme publication and
provider settings before reopening the reverse proxy. A media archive, image
rollback, or passing CI alone does not establish full production recovery.

Implementation references:
[PostgreSQL pg_dump](https://www.postgresql.org/docs/15/app-pgdump.html),
[PostgreSQL pg_restore](https://www.postgresql.org/docs/15/app-pgrestore.html),
[Compose project isolation](https://docs.docker.com/compose/how-tos/project-name/).
