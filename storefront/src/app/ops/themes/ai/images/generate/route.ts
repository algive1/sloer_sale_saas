import { NextRequest } from "next/server";
import sharp from "sharp";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { isStorefrontLocaleSlug } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import { activeAiProvider, aiConfigurationReady } from "@/plugins/theme-builder/ai-providers.server";
import { imageGenerationPrompt,validateImageRequest } from "@/plugins/theme-builder/ai-image-core";
import { ThemeValidationError } from "@/plugins/theme-builder/validate";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const reply=(data:object,status=200)=>Response.json(data,{status,headers});
const cooldown=new Map<string,number>();
const MAX_OUTPUT=5*1024*1024;
const MAX_INPUT=12*1024*1024;
async function validScope(channel:string,locale:string) {
  if(!isStorefrontLocaleSlug(locale)||
    !await isAllowedStorefrontChannel(channel,await getStorefrontChannelSlugs()))return false;
  const pairs=getConfiguredLocaleChannelPairs();
  return !pairs||pairs.some(pair=>pair.channel===channel&&pair.locale===locale);
}
/** Only accept inline image bytes; never fetch model-provided image URLs. */
export async function POST(request:NextRequest) {
  const origin=request.headers.get("origin");
  const site=request.headers.get("sec-fetch-site");
  if(origin!==request.nextUrl.origin||(site&&site!=="same-origin"))
    return reply({error:"Cross-origin image requests blocked"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({error:"JSON required"},415);
  if(!aiConfigurationReady())return reply({error:"Configure the image provider and encryption key first"},503);
  try {
    const raw=await request.text();
    if(raw.length>2400)return reply({error:"Image request too large"},413);
    const incoming:unknown=JSON.parse(raw);
    if(!incoming||typeof incoming!=="object"||Array.isArray(incoming))return reply({error:"Invalid input"},400);
    const body=incoming as Record<string,unknown>;
    const channel=typeof body.channel==="string"?body.channel:"";
    const locale=typeof body.locale==="string"?body.locale:"";
    if(!await validScope(channel,locale))return reply({error:"Invalid channel or locale"},400);
    const options=validateImageRequest(body.prompt,body.size,body.style);
    const provider=await activeAiProvider(channel);
    if(!provider)return reply({error:"Select an image-capable model in AI settings"},409);

    // A per-process guard; scale-out installations should additionally rate-limit
    // the /ops/themes/ai/images routes at the reverse proxy.
    const key=channel+":"+provider.id;
    const now=Date.now();
    if((cooldown.get(key)??0)>now)return reply({error:"Please wait before generating another image"},429);
    cooldown.set(key,now+15_000);
    if(cooldown.size>500)for(const [id,time] of cooldown)if(time<now)cooldown.delete(id);

    const result=await fetch(provider.baseUrl+"/images/generations",{
      method:"POST",redirect:"error",cache:"no-store",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+provider.apiKey},
      body:JSON.stringify({
        model:provider.model,prompt:imageGenerationPrompt(options),
        size:options.size,n:1,
      }),
      signal:AbortSignal.timeout(90_000),
    });
    if(!result.ok)return reply({error:result.status===401||result.status===403
      ?"The image provider rejected the API Key"
      :"Image provider failed ("+result.status+"); check image model and gateway support"},502);
    const statedLength=Number(result.headers.get("content-length")??0);
    if(statedLength>20_000_000)return reply({error:"Image provider response too large"},502);
    const bytes=await result.text();
    if(bytes.length>20_000_000)throw new ThemeValidationError("Image response too large");
    const output:unknown=JSON.parse(bytes);
    if(!output||typeof output!=="object"||!("data" in output))throw new ThemeValidationError("Invalid image response");
    const data=output as {data?:{b64_json?:unknown;url?:unknown}[]};
    const encoded=data.data?.[0]?.b64_json;
    if(typeof encoded!=="string"||encoded.length<16||encoded.length>Math.ceil(MAX_INPUT*4/3)+4||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      throw new ThemeValidationError("Image model must return base64 image bytes, not a temporary URL");
    const input=Buffer.from(encoded,"base64");
    if(!input.length||input.length>MAX_INPUT)throw new ThemeValidationError("Image too large");
    // Strip metadata (including EXIF) and bound dimensions and decompression.
    const image=sharp(input,{limitInputPixels:16_000_000,failOn:"error"});
    const info=await image.metadata();
    if(!["png","jpeg","webp"].includes(info.format??"")||
      !info.width||!info.height||info.width>4096||info.height>4096)
      throw new ThemeValidationError("Unsupported generated image");
    const webp=await image.rotate().resize({width:1600,withoutEnlargement:true})
      .webp({quality:82,effort:4}).toBuffer();
    if(!webp.length||webp.length>MAX_OUTPUT)throw new ThemeValidationError("Optimized image is too large");
    return reply({
      image:{base64:webp.toString("base64"),mime:"image/webp",width:Math.min(info.width,1600),
        provider:provider.title,model:provider.model},
    });
  }catch(error) {
    if(error instanceof ThemeValidationError||error instanceof SyntaxError)
      return reply({error:error instanceof SyntaxError?"Invalid model JSON response":error.message},422);
    console.error("[theme-ai] Image generation or conversion failed");
    return reply({error:"Image generation unavailable. Check model settings and retry."},503);
  }
}
