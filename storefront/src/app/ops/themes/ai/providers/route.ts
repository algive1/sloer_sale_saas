import { NextRequest } from "next/server";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { activeThemeSiteId } from "@/plugins/theme-builder/store";
import {
  aiConfigurationReady, getAiEndpointOptions, listAiProviders,
  createAiProvider, activateAiProvider, deleteAiProvider,
} from "@/plugins/theme-builder/ai-providers.server";
import { ThemeValidationError } from "@/plugins/theme-builder/validate";

const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const reply=(body:object,status=200)=>Response.json(body,{status,headers});
function sameOrigin(request:NextRequest):boolean {
  const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");
  return origin===request.nextUrl.origin&&(!site||site==="same-origin");
}
async function scope(channel:string){
  if(!await isAllowedStorefrontChannel(channel,await getStorefrontChannelSlugs()))
    throw new ThemeValidationError("Invalid channel");
  activeThemeSiteId(channel);
}
function fail(error:unknown){
  if(error instanceof ThemeValidationError)return reply({error:error.message},400);
  console.error("[theme-ai] Provider configuration request failed");
  return reply({error:"AI configuration unavailable"},503);
}
export async function GET(request:NextRequest) {
  try{
    const channel=request.nextUrl.searchParams.get("channel")??"";
    await scope(channel);
    if(!aiConfigurationReady())return reply({
      ready:false,items:[],allowedEndpoints:getAiEndpointOptions(),
      error:"Configure THEME_AI_ENCRYPTION_KEY and the theme database on the server",
    });
    return reply({ready:true,items:await listAiProviders(channel),allowedEndpoints:getAiEndpointOptions()});
  }catch(error){return fail(error);}
}
export async function POST(request:NextRequest) {
  if(!sameOrigin(request))return reply({error:"Cross-origin provider changes blocked"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return reply({error:"JSON required"},415);
  if(!aiConfigurationReady())return reply({error:"AI encryption and theme database must be configured"},503);
  try{
    const text=await request.text();
    if(text.length>3500)return reply({error:"Provider configuration too large"},413);
    const body:unknown=JSON.parse(text);
    if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Invalid configuration"},400);
    const input=body as Record<string,unknown>;
    const channel=typeof input.channel==="string"?input.channel:"";
    await scope(channel);
    if(input.action==="activate"){
      if(typeof input.id!=="string")return reply({error:"Provider ID required"},400);
      await activateAiProvider(channel,input.id);
      return reply({ok:true});
    }
    if(input.action!=="create"||!["title","baseUrl","model","apiKey"].every(x=>typeof input[x]==="string"))
      return reply({error:"Invalid provider configuration"},400);
    const item=await createAiProvider(channel,{
      title:input.title as string,baseUrl:input.baseUrl as string,
      model:input.model as string,apiKey:input.apiKey as string,
    });
    // Never return the API key, ciphertext, token prefix or any key fingerprint.
    return reply({ok:true,item},201);
  }catch(error){return fail(error);}
}
export async function DELETE(request:NextRequest) {
  if(!sameOrigin(request))return reply({error:"Cross-origin provider changes blocked"},403);
  if(!aiConfigurationReady())return reply({error:"AI configuration unavailable"},503);
  try{
    const channel=request.nextUrl.searchParams.get("channel")??"",id=request.nextUrl.searchParams.get("id")??"";
    await scope(channel);
    return await deleteAiProvider(channel,id)?reply({ok:true}):reply({error:"Provider not found"},404);
  }catch(error){return fail(error);}
}
