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
    "plugins": ["analytics", "ads-tracking", "payment-reminders", "customer-support"],
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
same snapshot under several service names. SQLite receipts must explicitly list
expected plugin IDs in `plugins`; `[]` explicitly means no plugin data is expected,
and is not evidence of restoration of an active plugin. Paths are relative to the receipt;
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

## Plugin storage compatibility (A23)

Before application builds or stopping writers, the runner verifies external
receipts and copies them into a private `external-preflight` directory. It checks
**the copied bytes** against the receipt digest, then runs SQLite integrity and
read-only plugin schema checks against those exact files. This prevents an active
source snapshot changing between validation and copying. Final quiesced backups
repeat the checks and retain the contract JSON alongside configuration/image IDs.
`--preflight-only` includes this gate when external state is configured.

The source contract v1 declares seven modules and17 owned SQLite tables. Existing
tables must retain required column types and exact ordered brand/job primary keys;
unknown mandatory insert columns and undeclared triggers block release. Theme
wrappers must use supported version1, translation states must be understood, and
analytics event identities cannot violate the runtime unique index. Opaque provider
keys are copied, never decrypted or returned in the compatibility report.

Known legacy analytics additions are recorded as `runtimeAdditions`; this gate
does **not** execute ALTER/backfill or claim a live migration passed. Missing unused
tables are labelled `uninitializedTables`. If an explicitly expected plugin has no
owned data tables at all, validation fails. No automatic creation or deletion of
provider state occurs. This checks schema/envelope compatibility, not every theme
block, provider authentication, data completeness or database performance.

The manifest retains contract SHA-256 and per-module API/storage contract versions.
Before reverting application images, validate a copy of the current snapshot using
the **target old checkout's** contract and run its application staging acceptance.
Never infer downgrade safety from a source version label. Unknown/breaking schemas
require an explicit reviewed migration and shadow recovery; do not force the gate,
restore over live orders or automatically replay uncertain external calls. Full
production libSQL/key/provider recovery and destructive schema downgrade remain
separate acceptance items.

Core operations separately declares three audit tables in `core.operations`: freight exports, tracking previews and tracking attempts. They are not analytics plugin data and remain required for operations when collection is paused. Snapshot preflight also rejects future tracking states, duplicate active claims and incompatible claim indexes; missing safe indexes are reported for runtime creation without modifying the source snapshot. See [tracking writeback](tracking-writeback.md). Source paths in this contract are relative to `storefront/src`.
