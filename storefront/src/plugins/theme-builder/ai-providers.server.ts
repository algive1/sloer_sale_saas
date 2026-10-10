import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { activeThemeSiteId, themeConnection } from "./store";
import { allowedAiEndpoints, validatedAiEndpoint, validatedAiModel } from "./ai-core";
import { ThemeValidationError } from "./validate";

export type AiProviderItem = {
  id:string; title:string; baseUrl:string; model:string; active:boolean; updatedAt:string;
};
export type AiProviderSecret = AiProviderItem & {apiKey:string};
const MAX_PROFILES=8;
let schemaPromise:Promise<void>|undefined;

function db() {
  const conn=themeConnection();
  if(!conn)throw new Error("Theme database is not configured");
  return conn;
}
function encryptionKey():Buffer {
  const input=process.env.THEME_AI_ENCRYPTION_KEY??"";
  if(!/^[0-9a-fA-F]{64}$/.test(input))throw new Error("THEME_AI_ENCRYPTION_KEY must be 64 hex characters");
  return Buffer.from(input,"hex");
}
export function aiConfigurationReady():boolean {
  return Boolean(themeConnection()&&/^[0-9a-fA-F]{64}$/.test(process.env.THEME_AI_ENCRYPTION_KEY??""));
}
function encrypt(value:string):string {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,tag,encrypted].map(b=>b.toString("base64url")).join(".");
}
function decrypt(value:string):string {
  const sections=value.split(".");
  if(sections.length!==3)throw new Error("Unknown encrypted provider key version");
  const [iv,tag,ciphertext]=sections.map(x=>Buffer.from(x,"base64url"));
  if(iv.length!==12||tag.length!==16)throw new Error("Invalid encrypted provider key");
  const decoder=createDecipheriv("aes-256-gcm",encryptionKey(),iv);
  decoder.setAuthTag(tag);
  return Buffer.concat([decoder.update(ciphertext),decoder.final()]).toString("utf8");
}
async function ensureSchema() {
  if(!schemaPromise) {
    schemaPromise=libsqlPipeline([{
      sql:`CREATE TABLE IF NOT EXISTS storefront_theme_ai_profiles (
        site_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        title TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(site_id,profile_id)
      )`,
    }],db()).then(()=>undefined).catch(e=>{schemaPromise=undefined;throw e;});
  }
  await schemaPromise;
}
const profileId=(id:string)=>{
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new ThemeValidationError("Invalid provider ID");
  return id;
};
function toItem(row:Record<string,unknown>):AiProviderItem {
  return {id:String(row.profile_id),title:String(row.title),baseUrl:String(row.base_url),
    model:String(row.model),active:Number(row.is_active)===1,updatedAt:String(row.updated_at)};
}

export function getAiEndpointOptions():string[] {
  return allowedAiEndpoints(process.env.THEME_AI_ALLOWED_ENDPOINTS);
}
export async function listAiProviders(channel:string):Promise<AiProviderItem[]> {
  await ensureSchema();
  const [result]=await libsqlPipeline([{
    sql:`SELECT profile_id,title,base_url,model,is_active,updated_at
      FROM storefront_theme_ai_profiles WHERE site_id=? ORDER BY is_active DESC, updated_at DESC LIMIT 8`,
    args:[activeThemeSiteId(channel)],wantRows:true,
  }],db());
  return hranaRowsToObjects(result).map(toItem);
}
export async function createAiProvider(channel:string,input:{
  title:string;baseUrl:string;model:string;apiKey:string;
}):Promise<AiProviderItem>{
  const title=input.title.trim();
  if(title.length<2||title.length>64||/[\u0000-\u001f]/.test(title))
    throw new ThemeValidationError("Provider name must be 2–64 characters");
  const baseUrl=validatedAiEndpoint(input.baseUrl,process.env.THEME_AI_ALLOWED_ENDPOINTS);
  const model=validatedAiModel(input.model);
  const key=input.apiKey.trim();
  if(!key||key.length>512||/[\u0000-\u0020]/.test(key))
    throw new ThemeValidationError("Enter a valid API key (not displayed again)");
  const siteId=activeThemeSiteId(channel);
  const id=randomUUID(),now=new Date().toISOString();
  await ensureSchema();
  const existing=await listAiProviders(channel);
  const [result]=await libsqlPipeline([{
    sql:`INSERT OR IGNORE INTO storefront_theme_ai_profiles
      (site_id,profile_id,title,base_url,model,api_key_encrypted,is_active,updated_at)
      SELECT ?,?,?,?,?,?, ?,? WHERE
        (SELECT COUNT(*) FROM storefront_theme_ai_profiles WHERE site_id=?) < ?`,
    args:[siteId,id,title,baseUrl,model,encrypt(key),existing.length===0?1:0,now,siteId,MAX_PROFILES],
  }],db());
  if(result?.affected_row_count!==1)throw new ThemeValidationError("Maximum of 8 AI providers per brand");
  return {id,title,baseUrl,model,active:existing.length===0,updatedAt:now};
}
export async function activateAiProvider(channel:string,id:string):Promise<void> {
  const site=activeThemeSiteId(channel);
  profileId(id);await ensureSchema();
  const [selected]=await libsqlPipeline([{
    sql:"SELECT profile_id FROM storefront_theme_ai_profiles WHERE site_id=? AND profile_id=? LIMIT 1",
    args:[site,id],wantRows:true,
  }],db());
  if(!hranaRowsToObjects(selected).length)throw new ThemeValidationError("Provider not found in this brand");
  // No secret material travels to the browser on activation.
  await libsqlPipeline([
    {sql:"UPDATE storefront_theme_ai_profiles SET is_active=0 WHERE site_id=?",args:[site]},
    {sql:"UPDATE storefront_theme_ai_profiles SET is_active=1,updated_at=? WHERE site_id=? AND profile_id=?",
      args:[new Date().toISOString(),site,id]},
  ],db());
}
export async function deleteAiProvider(channel:string,id:string):Promise<boolean> {
  profileId(id);await ensureSchema();
  const [out]=await libsqlPipeline([{
    sql:"DELETE FROM storefront_theme_ai_profiles WHERE site_id=? AND profile_id=?",
    args:[activeThemeSiteId(channel),id],
  }],db());
  return out?.affected_row_count===1;
}
export async function activeAiProvider(channel:string):Promise<AiProviderSecret|null> {
  await ensureSchema();
  const [result]=await libsqlPipeline([{
    sql:`SELECT profile_id,title,base_url,model,is_active,updated_at,api_key_encrypted
      FROM storefront_theme_ai_profiles
      WHERE site_id=? AND is_active=1 ORDER BY updated_at DESC LIMIT 1`,
    args:[activeThemeSiteId(channel)],wantRows:true,
  }],db());
  const row=hranaRowsToObjects(result)[0];
  if(!row)return null;
  const item=toItem(row);
  validatedAiEndpoint(item.baseUrl,process.env.THEME_AI_ALLOWED_ENDPOINTS);
  return {...item,apiKey:decrypt(String(row.api_key_encrypted))};
}
