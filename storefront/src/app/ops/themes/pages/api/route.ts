import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";

import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { isStorefrontLocaleSlug } from "@/config/locale";
import { buildStorefrontPath } from "@/lib/storefront-path";
import { themeDatabaseConfigured, ThemeConflictError } from "@/plugins/theme-builder/store";
import { readPageTheme, savePageTheme } from "@/plugins/theme-builder/pages-store";
import { isEditableThemePageType, validatePageTemplateKey } from "@/plugins/theme-builder/page-document";
import { ThemeValidationError } from "@/plugins/theme-builder/validate";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body:object,status=200)=>Response.json(body,{status,headers});

async function isValidScope(channel:string,locale:string) {
  if(!isStorefrontLocaleSlug(locale) ||
     !await isAllowedStorefrontChannel(channel,await getStorefrontChannelSlugs())) return false;
  const pairs=getConfiguredLocaleChannelPairs();
  return !pairs||pairs.some(pair=>pair.channel===channel&&pair.locale===locale);
}

function requestScope(query:URLSearchParams) {
  const channel=query.get("channel")??"";
  const locale=query.get("locale")??"";
  const pageType=query.get("pageType")??"";
  const key=query.get("template")??"default";
  if(!isEditableThemePageType(pageType))throw new ThemeValidationError("Unsupported page type");
  validatePageTemplateKey(key);
  return {channel,locale,pageType,key};
}

/** Operates under protected /ops namespace. Never expose documents through the public /api. */
export async function GET(request:NextRequest) {
  if(!themeDatabaseConfigured())return reply({error:"Theme storage is not configured"},503);
  try {
    const scope=requestScope(request.nextUrl.searchParams);
    if(!await isValidScope(scope.channel,scope.locale))return reply({error:"Invalid channel or locale"},400);
    return reply({...scope,...await readPageTheme(scope.channel,scope.locale,scope.pageType,scope.key)});
  } catch(error) {
    if(error instanceof ThemeValidationError)return reply({error:error.message},400);
    console.error("[theme-pages] Unable to load page theme",error);
    return reply({error:"Page theme storage unavailable"},503);
  }
}

export async function PUT(request:NextRequest) {
  const origin=request.headers.get("origin");
  const fetchSite=request.headers.get("sec-fetch-site");
  if(!origin||origin!==request.nextUrl.origin||(fetchSite&&fetchSite!=="same-origin"))
    return reply({error:"Cross-origin edits blocked"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({error:"JSON required"},415);
  if(!themeDatabaseConfigured())return reply({error:"Theme storage is not configured"},503);
  try {
    const raw=await request.text();
    if(raw.length>150_000)return reply({error:"Document too large"},413);
    const input:unknown=JSON.parse(raw);
    if(!input||typeof input!=="object"||Array.isArray(input))return reply({error:"Invalid input"},400);
    const body=input as Record<string,unknown>;
    const scope=requestScope(new URLSearchParams({
      channel:typeof body.channel==="string"?body.channel:"",
      locale:typeof body.locale==="string"?body.locale:"",
      pageType:typeof body.pageType==="string"?body.pageType:"",
      template:typeof body.template==="string"?body.template:"default",
    }));
    if(!await isValidScope(scope.channel,scope.locale))return reply({error:"Invalid channel or locale"},400);
    if(body.action!=="draft"&&body.action!=="publish")return reply({error:"Invalid action"},400);
    if(!Number.isSafeInteger(body.expectedRevision)||(body.expectedRevision as number)<0)
      return reply({error:"Invalid revision"},400);
    const revision=await savePageTheme(scope.channel,scope.locale,scope.pageType,scope.key,
      body.data,body.action==="publish",body.expectedRevision as number);
    if(body.action==="publish") {
      // Dynamic product route shares the same default page template for this brand/channel/locale.
      revalidatePath(buildStorefrontPath(scope.locale,scope.channel,"/products/[slug]"),"page");
    }
    return reply({ok:true,action:body.action,draftRevision:revision});
  } catch(error) {
    if(error instanceof ThemeConflictError)return reply({error:error.message},409);
    if(error instanceof ThemeValidationError||error instanceof SyntaxError)
      return reply({error:error.message},400);
    console.error("[theme-pages] Unable to save page theme",error);
    return reply({error:"Page theme storage unavailable"},503);
  }
}
