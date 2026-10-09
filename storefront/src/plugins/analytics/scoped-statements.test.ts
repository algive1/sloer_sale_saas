import { describe, expect, it } from "vitest";
import { withAnalyticsChannelScope } from "./scoped-statements";

describe("advanced Analytics SQL scoping", () => {
  const from = "2026-10-01T00:00:00.000Z";
  const to = "2026-10-02T00:00:00.000Z";

  it("scopes both halves of a nested CTE before aggregation or join", () => {
    const sql = `WITH top AS (
      SELECT country_code FROM analytics_events
      WHERE occurred_at >= ? AND occurred_at < ? GROUP BY country_code
    ) SELECT ai.product_id FROM analytics_event_items ai
      JOIN analytics_events ae ON ae.event_id = ai.event_id
      WHERE ae.occurred_at >= ? AND ae.occurred_at < ?
        AND ae.event_name = ?`;
    const [s] = withAnalyticsChannelScope(
      [{ sql, args: [from, to, from, to, "checkout_completed"], wantRows: true }],
      ["fashion-us", "fashion-eu"],
    );
    expect(s.sql).toContain("WHERE occurred_at >= ? AND occurred_at < ? AND channel IN (?, ?)");
    expect(s.sql).toContain("WHERE ae.occurred_at >= ? AND ae.occurred_at < ? AND ae.channel IN (?, ?)");
    expect(s.args).toEqual([from, to, "fashion-us", "fashion-eu", from, to, "fashion-us", "fashion-eu", "checkout_completed"]);
  });

  it("does not move parameters positioned between scoped CTEs", () => {
    const sql = `WITH first AS (
      SELECT session_id FROM analytics_events
      WHERE occurred_at >= ? AND occurred_at < ? AND event_name = ?
    ), last AS (
      SELECT session_id FROM analytics_events
      WHERE occurred_at >= ? AND occurred_at < ? AND event_name = 'checkout_completed'
    ) SELECT * FROM first JOIN last USING (session_id)`;
    const [s] = withAnalyticsChannelScope([{ sql, args: [from,to,"shipping_method_selected",from,to] }], ["brand-jp"]);
    expect(s.args).toEqual([from,to,"brand-jp","shipping_method_selected",from,to,"brand-jp"]);
  });

  it("throws rather than silently leaking when a new report query misses a scopeable filter", () => {
    expect(() => withAnalyticsChannelScope(
      [{ sql: "SELECT * FROM analytics_events WHERE event_name = ?", args: ["checkout_completed"] }],
      ["brand-a"],
    )).toThrow("scope every");
    expect(() => withAnalyticsChannelScope(
      [{ sql: "SELECT * FROM analytics_events WHERE occurred_at >= ? AND occurred_at < ?", args: [from] }],
      ["brand-a"],
    )).toThrow("scope every");
    expect(() => withAnalyticsChannelScope(
      [{ sql: "SELECT * FROM analytics_events WHERE occurred_at >= ? AND occurred_at < ?", args: [from,to] }],
      [],
    )).toThrow("at least one");
  });

  it("retains the exact original platform-wide SQL and arguments", () => {
    const s = { sql: "SELECT COUNT(*) FROM analytics_events WHERE occurred_at >= ? AND occurred_at < ?", args: [from,to] };
    expect(withAnalyticsChannelScope([s], null)).toEqual([s]);
  });
});
