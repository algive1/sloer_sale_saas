import { NextRequest } from "next/server";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { isStorefrontLocaleSlug } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { themeDatabaseConfigured } from "@/plugins/theme-builder/store";
import {
  type EditablePage,listSavedTemplates,getSavedTemplate,
  saveNamedTemplate,deleteSavedTemplate,
} from "@/plugins/theme-builder/saved-templates";
import { ThemeValidationError } from "@/plugins/theme-builder/validate";

const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const reply=(body:object,status=200)=>Response.json(body,{status,headers});
function scopeFrom(input:URLSearchParams){
  const channel=input.get("channel")??"",locale=input.get("locale")??"";
  const raw=input.get("pageType")??"";
  if(raw!=="home"&&raw!=="product")throw new ThemeValidationError("Invalid page type");
  return {channel,locale,pageType:raw as EditablePage};
}
async function allowed({channel,locale}:{channel:string;locale:string}) {
  if(!isStorefrontLocaleSlug(locale)||
    !await isAllowedStorefrontChannel(channel,await getStorefrontChannelSlugs()))return false;
  const pairs=getConfiguredLocaleChannelPairs();
  return !pairs||pairs.some(pair=>pair.channel===channel&&pair.locale===locale);
}
function sameOrigin(request:NextRequest){
  const origin=request.headers.get("origin");
  const fetchSite=request.headers.get("sec-fetch-site");
  return origin===request.nextUrl.origin&&(!fetchSite||fetchSite==="same-origin");
}

export async function GET(request:NextRequest){
  if(!themeDatabaseConfigured())return reply({error:"Template storage is not configured"},503);
  try{
    const scope=scopeFrom(request.nextUrl.searchParams);
    if(!await allowed(scope))return reply({error:"Invalid channel or locale"},400);
    const id=request.nextUrl.searchParams.get("id");
    if(id){
      const data=await getSavedTemplate(scope.channel,scope.locale,scope.pageType,id);
      return data?reply({data}):reply({error:"Template not found"},404);
    }
    return reply({items:await listSavedTemplates(scope.channel,scope.locale,scope.pageType)});
  }catch(error){
    if(error instanceof ThemeValidationError)return reply({error:error.message},400);
    console.error("[theme-library] Read failed",error);
    return reply({error:"Template library unavailable"},503);
  }
}

export async function POST(request:NextRequest){
  if(!sameOrigin(request))return reply({error:"Cross-origin changes blocked"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({error:"JSON required"},415);
  if(!themeDatabaseConfigured())return reply({error:"Template storage is not configured"},503);
  try{
    const text=await request.text();
    if(text.length>150_000)return reply({error:"Template exceeds size limit"},413);
    const body:unknown=JSON.parse(text);
    if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Invalid request"},400);
    const input=body as Record<string,unknown>;
    const params=new URLSearchParams({
      channel:typeof input.channel==="string"?input.channel:"",
      locale:typeof input.locale==="string"?input.locale:"",
      pageType:typeof input.pageType==="string"?input.pageType:"",
    });
    const scope=scopeFrom(params);
    if(!await allowed(scope))return reply({error:"Invalid channel or locale"},400);
    const record=await saveNamedTemplate(scope.channel,scope.locale,scope.pageType,
      typeof input.title==="string"?input.title:"",input.data);
    return reply({ok:true,item:record},201);
  }catch(error){
    if(error instanceof ThemeValidationError||error instanceof SyntaxError)
      return reply({error:error.message},400);
    console.error("[theme-library] Save failed",error);
    return reply({error:"Template library unavailable"},503);
  }
}

export async function DELETE(request:NextRequest){
  if(!sameOrigin(request))return reply({error:"Cross-origin changes blocked"},403);
  if(!themeDatabaseConfigured())return reply({error:"Template storage is not configured"},503);
  try{
    const scope=scopeFrom(request.nextUrl.searchParams);
    if(!await allowed(scope))return reply({error:"Invalid channel or locale"},400);
    const id=request.nextUrl.searchParams.get("id")??"";
    return await deleteSavedTemplate(scope.channel,scope.locale,scope.pageType,id)
      ?reply({ok:true}):reply({error:"Template not found"},404);
  }catch(error){
    if(error instanceof ThemeValidationError)return reply({error:error.message},400);
    console.error("[theme-library] Delete failed",error);
    return reply({error:"Template library unavailable"},503);
  }
}
