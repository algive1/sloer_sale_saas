import "server-only";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { parseTheme, serializeTheme } from "./validate";
import type { ThemeData } from "./template";

type StoredTheme = {
  draft: ThemeData | null;
  published: ThemeData | null;
  draftRevision: number;
  publishedRevision: number;
};
const empty: StoredTheme = { draft: null, published: null, draftRevision: 0, publishedRevision: 0 };
export class ThemeConflictError extends Error {}
let schemaPromise: Promise<void> | undefined;

function themeConnection() {
  const dedicatedUrl = process.env.THEME_LIBSQL_URL?.trim();
  const dedicatedToken = process.env.THEME_LIBSQL_AUTH_TOKEN?.trim();
  // Do not silently pair a dedicated URL with unrelated analytics credentials.
  if (dedicatedUrl || dedicatedToken) {
    return dedicatedUrl && dedicatedToken ? {url: dedicatedUrl, token: dedicatedToken} : null;
  }
  // Existing self-hosted deployments can reuse their configured analytics libSQL
  // service: separate table, isolated site/channel/locale composite key.
  const url = process.env.ANALYTICS_LIBSQL_URL?.trim();
  const token = process.env.ANALYTICS_LIBSQL_AUTH_TOKEN?.trim();
  return url && token ? {url, token} : null;
}

function database() {
  const connection = themeConnection();
  if (!connection) throw new Error("Theme storage is not configured");
  return connection;
}

export function themeDatabaseConfigured(): boolean {
  return themeConnection() !== null;
}

export function activeThemeSiteId(): string {
  const siteId = process.env.STOREFRONT_SITE_ID?.trim() || "primary";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(siteId)) throw new Error("Invalid STOREFRONT_SITE_ID");
  return siteId;
}

async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await libsqlPipeline([{
        sql: `CREATE TABLE IF NOT EXISTS storefront_theme_homepages (
          site_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          locale TEXT NOT NULL,
          draft_json TEXT,
          published_json TEXT,
          draft_revision INTEGER NOT NULL DEFAULT 0,
          published_revision INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (site_id, channel, locale)
        )`,
      }], database());
    })().catch((error: unknown) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

export async function readTheme(channel: string, locale: string): Promise<StoredTheme> {
  if (!themeDatabaseConfigured()) return empty;
  await ensureSchema();
  const [result] = await libsqlPipeline([{
    sql: "SELECT draft_json, published_json, draft_revision, published_revision FROM storefront_theme_homepages WHERE site_id = ? AND channel = ? AND locale = ? LIMIT 1",
    args: [activeThemeSiteId(), channel, locale],
    wantRows: true,
  }], database());
  const record = hranaRowsToObjects(result)[0];
  if (!record) return empty;
  return {
    draft: parseTheme(record.draft_json),
    published: parseTheme(record.published_json),
    draftRevision: Number(record.draft_revision) || 0,
    publishedRevision: Number(record.published_revision) || 0,
  };
}

/**
 * Compare-and-swap prevents concurrent editors from silently replacing one
 * another's draft or publishing an outdated copy.
 */
export async function saveTheme(
  channel: string,
  locale: string,
  input: unknown,
  publish: boolean,
  expectedRevision: number,
): Promise<number> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new ThemeConflictError("Invalid revision; reload the editor.");
  }
  const json = serializeTheme(input);
  await ensureSchema();
  const siteId = activeThemeSiteId();
  const now = new Date().toISOString();
  const statement = expectedRevision === 0
    ? {
      sql: `INSERT OR IGNORE INTO storefront_theme_homepages
        (site_id, channel, locale, draft_json, published_json, draft_revision, published_revision, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [siteId, channel, locale, json, publish ? json : null, publish ? 1 : 0, now],
    }
    : {
      sql: publish
        ? `UPDATE storefront_theme_homepages
           SET draft_json = ?, published_json = ?, draft_revision = draft_revision + 1,
               published_revision = published_revision + 1, updated_at = ?
           WHERE site_id = ? AND channel = ? AND locale = ? AND draft_revision = ?`
        : `UPDATE storefront_theme_homepages
           SET draft_json = ?, draft_revision = draft_revision + 1, updated_at = ?
           WHERE site_id = ? AND channel = ? AND locale = ? AND draft_revision = ?`,
      args: publish
        ? [json, json, now, siteId, channel, locale, expectedRevision]
        : [json, now, siteId, channel, locale, expectedRevision],
    };

  const [result] = await libsqlPipeline([statement], database());
  if (result?.affected_row_count !== 1) {
    throw new ThemeConflictError("This draft changed elsewhere. Reload before saving.");
  }
  return expectedRevision + 1;
}
