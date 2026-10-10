import "server-only";

import { hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { activeThemeSiteId, themeConnection, ThemeConflictError } from "./store";
import { parseTheme, serializeTheme } from "./validate";
import {
  type ThemePageType, validatePageTemplateKey, validatePageThemeDocument,
} from "./page-document";
import type { ThemeData } from "./template";

export type StoredPageTheme = {
  draft: ThemeData | null;
  published: ThemeData | null;
  draftRevision: number;
  publishedRevision: number;
};
const empty: StoredPageTheme = { draft: null, published: null, draftRevision: 0, publishedRevision: 0 };
let schemaPromise: Promise<void> | undefined;

function connection() {
  const found = themeConnection();
  if (!found) throw new Error("Theme storage is not configured");
  return found;
}

async function ensurePageSchema() {
  if (!schemaPromise) {
    schemaPromise = libsqlPipeline([{
      sql: `CREATE TABLE IF NOT EXISTS storefront_theme_pages (
        site_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        locale TEXT NOT NULL,
        page_type TEXT NOT NULL,
        template_key TEXT NOT NULL,
        draft_json TEXT,
        published_json TEXT,
        draft_revision INTEGER NOT NULL DEFAULT 0,
        published_revision INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (site_id, channel, locale, page_type, template_key)
      )`,
    }], connection()).then(() => undefined).catch((error: unknown) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

/**
 * New table, not an ALTER of storefront_theme_homepages. Existing published
 * homepages continue to use their original storage, unchanged.
 */
export async function readPageTheme(
  channel: string, locale: string, pageType: ThemePageType, key = "default",
): Promise<StoredPageTheme> {
  validatePageTemplateKey(key);
  if (!themeConnection()) return empty;
  await ensurePageSchema();
  const [result] = await libsqlPipeline([{
    sql: `SELECT draft_json, published_json, draft_revision, published_revision
      FROM storefront_theme_pages
      WHERE site_id=? AND channel=? AND locale=? AND page_type=? AND template_key=? LIMIT 1`,
    args: [activeThemeSiteId(channel), channel, locale, pageType, key],
    wantRows: true,
  }], connection());
  const record = hranaRowsToObjects(result)[0];
  if (!record) return empty;
  const draft = parseTheme(record.draft_json);
  const published = parseTheme(record.published_json);
  return {
    draft: draft ? validatePageThemeDocument(pageType, draft) : null,
    published: published ? validatePageThemeDocument(pageType, published) : null,
    draftRevision: Number(record.draft_revision) || 0,
    publishedRevision: Number(record.published_revision) || 0,
  };
}

export async function savePageTheme(
  channel: string,
  locale: string,
  pageType: ThemePageType,
  key: string,
  document: unknown,
  publish: boolean,
  expectedRevision: number,
): Promise<number> {
  validatePageTemplateKey(key);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new ThemeConflictError("Invalid revision; reload the editor.");
  }
  const json = serializeTheme(validatePageThemeDocument(pageType, document));
  await ensurePageSchema();
  const scope = [activeThemeSiteId(channel), channel, locale, pageType, key];
  const now = new Date().toISOString();
  const statement = expectedRevision === 0
    ? {
      sql: `INSERT OR IGNORE INTO storefront_theme_pages
        (site_id,channel,locale,page_type,template_key,draft_json,published_json,
         draft_revision,published_revision,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)`,
      args: [...scope, json, publish ? json : null, publish ? 1 : 0, now],
    }
    : {
      sql: publish
        ? `UPDATE storefront_theme_pages
          SET draft_json=?,published_json=?,draft_revision=draft_revision+1,
            published_revision=published_revision+1,updated_at=?
          WHERE site_id=? AND channel=? AND locale=? AND page_type=? AND template_key=?
            AND draft_revision=?`
        : `UPDATE storefront_theme_pages
          SET draft_json=?,draft_revision=draft_revision+1,updated_at=?
          WHERE site_id=? AND channel=? AND locale=? AND page_type=? AND template_key=?
            AND draft_revision=?`,
      args: publish
        ? [json, json, now, ...scope, expectedRevision]
        : [json, now, ...scope, expectedRevision],
    };
  const [result] = await libsqlPipeline([statement], connection());
  if (result?.affected_row_count !== 1) {
    throw new ThemeConflictError("This page draft changed elsewhere. Reload before saving.");
  }
  return expectedRevision + 1;
}
