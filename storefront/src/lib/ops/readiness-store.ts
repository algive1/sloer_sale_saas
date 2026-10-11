import "server-only";
import { analyticsDatabaseConfigured, hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import type { ReadinessRecord } from "./readiness-model";

export class ReadinessConflictError extends Error {}
export const readinessStorageConfigured = analyticsDatabaseConfigured;

async function schema() {
  if (!readinessStorageConfigured()) throw new Error("readiness_storage_unavailable");
  await libsqlPipeline([{
    sql: `CREATE TABLE IF NOT EXISTS ops_site_readiness_events (
      site_id TEXT NOT NULL, check_id TEXT NOT NULL, revision INTEGER NOT NULL,
      context_hash TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('passed','failed')),
      verified_by TEXT NOT NULL, verified_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      environment TEXT NOT NULL CHECK(environment IN ('production','test')),
      evidence TEXT NOT NULL, PRIMARY KEY(site_id, check_id, revision))`,
  }]);
}

function record(row: Record<string, unknown>): ReadinessRecord {
  return { checkId: String(row.check_id), revision: Number(row.revision), contextHash: String(row.context_hash),
    result: row.result === "passed" ? "passed" : "failed", verifiedBy: String(row.verified_by),
    verifiedAt: String(row.verified_at), expiresAt: String(row.expires_at), evidence: String(row.evidence),
    environment: row.environment === "production" ? "production" : "test" };
}

export async function readinessRecords(siteId: string): Promise<ReadinessRecord[]> {
  await schema();
  const [result] = await libsqlPipeline([{
    sql: `SELECT e.* FROM ops_site_readiness_events e
      JOIN (SELECT check_id, MAX(revision) revision FROM ops_site_readiness_events WHERE site_id = ? GROUP BY check_id) latest
      ON e.check_id = latest.check_id AND e.revision = latest.revision WHERE e.site_id = ? ORDER BY e.check_id`,
    args: [siteId, siteId], wantRows: true,
  }]);
  return hranaRowsToObjects(result).map(record);
}

export async function readinessHistory(siteId: string): Promise<ReadinessRecord[]> {
  await schema();
  const [result] = await libsqlPipeline([{
    sql: "SELECT * FROM ops_site_readiness_events WHERE site_id = ? ORDER BY verified_at DESC, check_id LIMIT 40",
    args: [siteId], wantRows: true,
  }]);
  return hranaRowsToObjects(result).map(record);
}

export async function appendReadinessRecord(siteId: string, input: Omit<ReadinessRecord, "revision">, expectedRevision: number): Promise<void> {
  await schema();
  const [result] = await libsqlPipeline([{
    sql: `INSERT OR IGNORE INTO ops_site_readiness_events
      (site_id, check_id, revision, context_hash, result, verified_by, verified_at, expires_at, evidence, environment)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE COALESCE((SELECT MAX(revision) FROM ops_site_readiness_events WHERE site_id = ? AND check_id = ?), 0) = ?`,
    args: [siteId, input.checkId, expectedRevision + 1, input.contextHash, input.result, input.verifiedBy,
      input.verifiedAt, input.expiresAt, input.evidence, input.environment, siteId, input.checkId, expectedRevision],
  }]);
  if (result?.affected_row_count !== 1) throw new ReadinessConflictError("readiness_changed");
}
