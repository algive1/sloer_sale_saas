import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/libsql-http", async original => ({
  ...await original<typeof import("@/lib/storage/libsql-http")>(),
  analyticsDatabaseConfigured: () => true,
  libsqlPipeline: async (statements: Array<{ sql: string; args?: Array<string | number | boolean | null>; wantRows?: boolean }>) => statements.map(s => {
    const stmt = state.db!.prepare(s.sql); const args = (s.args ?? []).map(a => typeof a === "boolean" ? Number(a) : a);
    if (!s.wantRows) return { cols: [], rows: [], affected_row_count: Number(stmt.run(...args).changes) };
    const rows = stmt.all(...args); const names = stmt.columns().map(c => c.name);
    return { cols: names.map(name => ({ name })), rows: rows.map(row => names.map(name => { const v = row[name]; return v === null ? { type: "null" } : typeof v === "number" ? { type: "float", value: v } : { type: "text", value: String(v) }; })) };
  }),
}));
let report: typeof import("./realtime-report");
const now = new Date("2026-10-11T00:30:00.000Z");
beforeEach(async () => {
  vi.resetModules(); state.db = new DatabaseSync(":memory:");
  const store = await import("./first-party-store"); await store.ensureAnalyticsSchema();
  report = await import("./realtime-report");
  for (const [id, channel, country, value, timestamp, device] of [
    ["own", "fashion-us", "US", 20, now.toISOString(), "desktop"],
    ["foreign", "jewelry-us", "DE", 900, now.toISOString(), "mobile"],
    ["other-market", "fashion-eu", "FR", 30, now.toISOString(), "mobile"],
    ["old", "fashion-us", "GB", 10, "2026-10-11T00:20:00.000Z", "desktop"],
    ["bot", "fashion-us", "JP", 800, now.toISOString(), "bot"],
  ]) {
    state.db.prepare("INSERT INTO analytics_events (id,occurred_at,event_name,channel,event_id,session_id,transaction_id,value,currency,country_code,source,device_type,payload_json) VALUES (?,?,'checkout_completed',?,?,?,?,?,'USD',?,?,?,'{}')").run(id, timestamp, channel, id, `session-${id}`, id, value, country, `source-${id}`, device);
    state.db.prepare("INSERT INTO analytics_event_items (event_name,event_id,item_index,item_id,item_name,quantity) VALUES ('checkout_completed',?,0,?,?,1)").run(id, id, `Product ${id}`);
  }
});
afterEach(() => state.db!.close());

it("filters all eight real SQLite subreports before aggregation, ranking and joining", async () => {
  const scoped = await report.readRealtimeAnalytics(now, ["fashion-us", "fashion-eu"]);
  expect(scoped.summary).toMatchObject({ activeSessions: 2, events: 2, orders: 2 });
  expect(scoped.salesByCurrency).toEqual([{ currency: "USD", value: 50 }]);
  expect(scoped.sources.map(s => s.source).sort()).toEqual(["source-other-market", "source-own"]);
  expect(scoped.countries.map(s => s.countryCode).sort()).toEqual(["FR", "US"]);
  expect(scoped.topProducts.map(s => s.itemName).sort()).toEqual(["Product other-market", "Product own"]);
  expect(scoped.recentOrders.map(s => s.transactionId).sort()).toEqual(["old", "other-market", "own"]);
  expect(scoped.recentEvents.every(e => ["fashion-us", "fashion-eu"].includes(e.channel))).toBe(true);
  expect(scoped.trend.reduce((sum, r) => sum + r.events, 0)).toBe(3);
  expect(JSON.stringify(scoped)).not.toMatch(/foreign|jewelry|source-bot|Product bot/);
});
it("keeps platform aggregation explicit and rejects empty or unsafe brand channels", async () => {
  expect((await report.readRealtimeAnalytics(now, null)).summary.events).toBe(3);
  await expect(report.readRealtimeAnalytics(now, [])).rejects.toThrow("at least one");
  await expect(report.readRealtimeAnalytics(now, ["x' OR 1=1"])).rejects.toThrow("at least one");
});
