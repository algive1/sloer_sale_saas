/**
 * Restrict operational analytics to the server-configured Saleor Channels of
 * exactly one brand. Never accept these from browser query/body as authority.
 * Legacy platform-wide queries explicitly pass null, never an empty list.
 */
export function analyticsChannelClause(
  channels: readonly string[] | null,
  column = "channel",
): { sql: string; args: string[] } {
  if (channels === null) return { sql: "", args: [] };
  if (!channels.length || channels.some((slug) => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug))) {
    throw new Error("Analytics requires at least one valid brand channel");
  }
  const unique = [...new Set(channels)];
  // Column is selected exclusively by trusted callers; no HTTP-supplied identifier.
  if (column !== "channel" && column !== "ae.channel") {
    throw new Error("Invalid analytics channel column");
  }
  return {
    sql: ` AND ${column} IN (${unique.map(() => "?").join(", ")})`,
    args: unique,
  };
}
