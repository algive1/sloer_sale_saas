import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pipeline: vi.fn(async (statements: readonly { sql: string; args?: (string | number | null)[] }[]) =>
    statements.map(() => ({ cols: [], rows: [] }))),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/libsql-http", () => ({
  analyticsDatabaseConfigured: () => true,
  libsqlPipeline: mocks.pipeline,
  hranaRowsToObjects: (result: { rows?: unknown[] } | undefined) => result?.rows ?? [],
}));
import { readAnalyticsSummary } from "./first-party-store";

describe("brand operational analytics SQL tenant boundary", () => {
  it("binds trusted Channel IDs in all seven subreports, including abandoned sessions", async () => {
    await readAnalyticsSummary(7, ["fashion-us", "fashion-eu"]);
    const statements = mocks.pipeline.mock.lastCall?.[0] ?? [];
    expect(statements).toHaveLength(7);
    for (const statement of statements) {
      expect(statement.sql).toContain("AND channel IN (?, ?)");
      expect(statement.args).toContain("fashion-us");
      expect(statement.args).toContain("fashion-eu");
      expect(statement.sql).not.toContain("fashion-us");
    }
    expect(statements[5].sql).toContain("GROUP BY session_id");
    expect(statements[5].args?.length).toBe(4); // since + two channels + abandonment cutoff
  });

  it("keeps explicit platform-wide reporting working without a fake brand scope", async () => {
    await readAnalyticsSummary(7, null);
    const statements = mocks.pipeline.mock.lastCall?.[0] ?? [];
    expect(statements).toHaveLength(7);
    expect(statements.every((statement) => !statement.sql.includes("channel IN"))).toBe(true);
    expect(statements[0].args?.length).toBe(1);
    expect(statements[5].args?.length).toBe(2);
  });

  it("rejects empty Channel assignment before issuing a cross-brand SQL query", async () => {
    mocks.pipeline.mockClear();
    await expect(readAnalyticsSummary(7, [])).rejects.toThrow("at least one");
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });
});
