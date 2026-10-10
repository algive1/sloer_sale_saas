import "server-only";

import { randomUUID } from "node:crypto";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { activeThemeSiteId, themeConnection } from "./store";
import { validatePageThemeDocument } from "./page-document";
import { ThemeValidationError, parseTheme, serializeTheme, validateThemeData } from "./validate";
import type { ThemeData } from "./template";

export type EditablePage = "home" | "product";
export type SavedTemplateSummary = { id:string;title:string;updatedAt:string };
export const MAX_SAVED_TEMPLATES = 40;
let setup:Promise<void>|undefined;

function conn(){
  const value=themeConnection();
  if(!value)throw new Error("Theme storage is not configured");
  return value;
}
async function ensureSchema(){
  if(!setup)setup=libsqlPipeline([{
    sql:`CREATE TABLE IF NOT EXISTS storefront_theme_saved_templates (
      site_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      locale TEXT NOT NULL,
      page_type TEXT NOT NULL,
      template_id TEXT NOT NULL,
      title TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(site_id,channel,locale,page_type,template_id)
    )`,
  }],conn()).then(()=>undefined).catch((error:unknown)=>{setup=undefined;throw error;});
  await setup;
}
function scope(channel:string,locale:string,pageType:EditablePage){
  return [activeThemeSiteId(channel),channel,locale,pageType];
}
function idGuard(id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new ThemeValidationError("Invalid saved template ID");
}
export function validateTemplateDocument(pageType:EditablePage,input:unknown):ThemeData {
  return pageType==="product"?validatePageThemeDocument("product",input):validateThemeData(input);
}
export async function listSavedTemplates(channel:string,locale:string,pageType:EditablePage){
  await ensureSchema();
  const [result]=await libsqlPipeline([{
    sql:`SELECT template_id,title,updated_at FROM storefront_theme_saved_templates
      WHERE site_id=? AND channel=? AND locale=? AND page_type=?
      ORDER BY updated_at DESC LIMIT 40`,
    args:scope(channel,locale,pageType),wantRows:true,
  }],conn());
  return hranaRowsToObjects(result).map(r=>({
    id:String(r.template_id),title:String(r.title),updatedAt:String(r.updated_at),
  })) satisfies SavedTemplateSummary[];
}
export async function getSavedTemplate(
  channel:string,locale:string,pageType:EditablePage,id:string,
):Promise<ThemeData|null> {
  idGuard(id);await ensureSchema();
  const [result]=await libsqlPipeline([{
    sql:`SELECT data_json FROM storefront_theme_saved_templates
      WHERE site_id=? AND channel=? AND locale=? AND page_type=? AND template_id=? LIMIT 1`,
    args:[...scope(channel,locale,pageType),id],wantRows:true,
  }],conn());
  const record=hranaRowsToObjects(result)[0];
  const document=parseTheme(record?.data_json);
  return document?validateTemplateDocument(pageType,document):null;
}
export async function saveNamedTemplate(
  channel:string,locale:string,pageType:EditablePage,title:string,input:unknown,
):Promise<SavedTemplateSummary> {
  const clean=title.trim();
  if(clean.length<2||clean.length>60||/[\u0000-\u001f]/.test(clean))
    throw new ThemeValidationError("Template name must contain 2–60 readable characters");
  const json=serializeTheme(validateTemplateDocument(pageType,input));
  const id=randomUUID();
  const now=new Date().toISOString();
  await ensureSchema();
  // The maximum is checked in the INSERT itself, so concurrent editors cannot
  // race two independent "COUNT" requests and exceed the configured limit.
  const [result]=await libsqlPipeline([{
    sql:`INSERT OR IGNORE INTO storefront_theme_saved_templates
      (site_id,channel,locale,page_type,template_id,title,data_json,updated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (
        SELECT COUNT(*) FROM storefront_theme_saved_templates
        WHERE site_id=? AND channel=? AND locale=? AND page_type=?
      ) < ?`,
    args:[...scope(channel,locale,pageType),id,clean,json,now,
      ...scope(channel,locale,pageType),MAX_SAVED_TEMPLATES],
  }],conn());
  if(result?.affected_row_count!==1)
    throw new ThemeValidationError("Template library is full (40). Delete a template first");
  return {id,title:clean,updatedAt:now};
}
export async function deleteSavedTemplate(
  channel:string,locale:string,pageType:EditablePage,id:string,
):Promise<boolean> {
  idGuard(id);await ensureSchema();
  const [result]=await libsqlPipeline([{
    sql:`DELETE FROM storefront_theme_saved_templates
      WHERE site_id=? AND channel=? AND locale=? AND page_type=? AND template_id=?`,
    args:[...scope(channel,locale,pageType),id],
  }],conn());
  return result?.affected_row_count===1;
}
