import { analyticsChannelClause } from "./channel-scope";

/** Narrow input shape shared by libSQL report readers. */
type SqlStatement = { sql: string; args?: readonly (string | number | boolean | null)[]; wantRows?: boolean };

/**
 * Enforce a Channel scope on ALL analytics_events reads in a report statement.
 *
 * The report SQL already contains date predicates of the form
 *   WHERE [ae.]occurred_at >= ? AND [ae.]occurred_at < ?
 * even inside CTEs. Insert a trusted Channel filter at each such predicate.
 *
 * Strictly fail closed when a new/changed query uses an unsupported shape:
 * adding a new CTE without a predicate must never silently expose other brands.
 * Statement ordering/parameter placeholders are checked before and after.
 */
export function withAnalyticsChannelScope<T extends SqlStatement>(
  statements: readonly T[],
  channels: readonly string[] | null,
): T[] {
  if (channels === null) return [...statements];

  const allowed = analyticsChannelClause(channels);
  const timePredicate = /\bWHERE\s+((?:ae\.)?)occurred_at\s*>=\s*\?\s+AND\s+(?:ae\.)?occurred_at\s*<\s*\?/g;

  return statements.map((statement) => {
    const sql = statement.sql;
    // Static SQL created inside our report modules; no user identifiers in SQL.
    const fromTables = [...sql.matchAll(/\b(?:FROM|JOIN)\s+analytics_events\b/gi)].length;
    if (fromTables === 0) throw new Error("Channel-scoped analytics query has no events table");

    const input = statement.args ?? [];
    const values: (string | number | boolean | null)[] = [];
    let cursor = 0;
    let inputIndex = 0;
    let count = 0;
    const outputSql = sql.replace(timePredicate, (matched, alias: string, offset: number) => {
      const before = sql.slice(cursor, offset);
      // Consume original bind args in exactly the same order as placeholders.
      const skipped = (before.match(/\?/g) ?? []).length;
      values.push(...input.slice(inputIndex, inputIndex + skipped));
      inputIndex += skipped;
      values.push(...input.slice(inputIndex, inputIndex + 2));
      inputIndex += 2;
      values.push(...allowed.args);
      cursor = offset + matched.length;
      count++;
      const condition = analyticsChannelClause(channels, alias ? "ae.channel" : "channel");
      return matched + condition.sql;
    });

    const remaining = (sql.slice(cursor).match(/\?/g) ?? []).length;
    values.push(...input.slice(inputIndex, inputIndex + remaining));
    inputIndex += remaining;
    if (count !== fromTables || inputIndex !== input.length ||
        (outputSql.match(/\?/g) ?? []).length !== values.length) {
      throw new Error("Analytics SQL must scope every events-table read");
    }
    return { ...statement, sql: outputSql, args: values };
  });
}
