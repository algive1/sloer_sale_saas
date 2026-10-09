import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as Array<ReadonlyArray<{ sql: string; args?: readonly unknown[] }>>,
  query: vi.fn(async (statements: ReadonlyArray<{sql:string;args?:readonly unknown[]}>) => {
    db.calls.push(statements);
    return statements.map(() => ({ cols: [], rows: [] }));
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/plugins/analytics/first-party-store", () => ({ ensureAnalyticsSchema: async () => {} }));
vi.mock("@/lib/storage/libsql-http", () => ({
  libsqlPipeline: db.query,
  hranaRowsToObjects: () => [],
}));
import { readTrafficReport } from "./traffic-report";
import { readProductReport } from "./product-report";
import { readCheckoutReport } from "./checkout-report";

const range = { from: new Date("2026-10-01T00:00:00.000Z"), to: new Date("2026-10-02T00:00:00.000Z"), bucket: "day" as const };
const scope = ["fashion-us", "fashion-eu"];

describe("each advanced dashboard enforces current brand in SQL", () => {
  it.each([
    ["traffic", readTrafficReport, 8],
    ["products", readProductReport, 4],
    ["checkout", readCheckoutReport, 7],
  ] as const)("%s scopes every events table read in all %s SQL statements", async (_name, report, expected) => {
    db.calls.length = 0;
    await report({ ...range, channels: scope });
    const statements = db.calls.at(-1) ?? [];
    expect(statements).toHaveLength(expected);
    for (const stmt of statements) {
      const tables = (stmt.sql.match(/(?:FROM|JOIN)\s+analytics_events\b/gi) ?? []).length;
      const predicates = (stmt.sql.match(/(?:ae\.)?channel IN \(\?, \?\)/g) ?? []).length;
      expect(tables).toBeGreaterThan(0);
      expect(predicates).toBe(tables);
      expect(stmt.args).toContain("fashion-us");
      expect(stmt.args).toContain("fashion-eu");
      expect(stmt.sql).not.toContain("fashion-us");
      expect((stmt.sql.match(/\?/g) ?? []).length).toBe(stmt.args?.length);
    }
  });

  it("never permits empty site Channel sets to fall back to global aggregate", async () => {
    db.calls.length = 0;
    await expect(readTrafficReport({ ...range, channels: [] })).rejects.toThrow("at least one");
    expect(db.calls).toHaveLength(0);
  });
});
