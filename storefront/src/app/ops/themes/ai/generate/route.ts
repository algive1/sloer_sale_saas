import { NextRequest } from "next/server";
import { getStorefrontChannelSlugs } from "@/lib/channel-slugs";
import { isAllowedStorefrontChannel } from "@/config/channels";
import { isStorefrontLocaleSlug } from "@/config/locale";
import { getConfiguredLocaleChannelPairs } from "@/config/locale-channel";
import {
  MAX_AI_PROMPT,acceptAiProposal,aiSystemPrompt,extractAiMessage,
  validatedAiDocument,type AiPageType,type AiEditMode,type AiTurn,
} from "@/plugins/theme-builder/ai-core";
import { activeAiProvider, aiConfigurationReady } from "@/plugins/theme-builder/ai-providers.server";
import { ThemeValidationError } from "@/plugins/theme-builder/validate";

const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const reply=(body:object,status=200)=>Response.json(body,{status,headers});
const cooldown=new Map<string,number>();
async function permitted(channel:string,locale:string) {
  if(!isStorefrontLocaleSlug(locale)||!await isAllowedStorefrontChannel(channel,await getStorefrontChannelSlugs()))
    return false;
  const pairs=getConfiguredLocaleChannelPairs();
  return !pairs||pairs.some(p=>p.channel===channel&&p.locale===locale);
}
function validTurns(raw:unknown):AiTurn[]{
  if(!Array.isArray(raw))return [];
  return raw.slice(-6).filter((item:unknown):item is AiTurn=>
    !!item&&typeof item==="object"&&!Array.isArray(item)&&
    ("role" in item)&&(item.role==="user"||item.role==="assistant")&&
    ("content" in item)&&typeof item.content==="string"
    &&item.content.length<=600).map(item=>({role:item.role,content:item.content}));
}
export async function POST(request:NextRequest) {
  const origin=request.headers.get("origin"),fetchSite=request.headers.get("sec-fetch-site");
  if(origin!==request.nextUrl.origin||(fetchSite&&fetchSite!=="same-origin"))
    return reply({error:"Cross-origin generation blocked"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({error:"JSON required"},415);
  if(!aiConfigurationReady())return reply({error:"AI settings not configured on server"},503);
  try{
    const raw=await request.text();
    if(raw.length>150_000)return reply({error:"Page request too large"},413);
    const input:unknown=JSON.parse(raw);
    if(!input||typeof input!=="object"||Array.isArray(input))return reply({error:"Invalid request"},400);
    const b=input as Record<string,unknown>;
    const channel=typeof b.channel==="string"?b.channel:"",locale=typeof b.locale==="string"?b.locale:"";
    if(!await permitted(channel,locale))return reply({error:"Invalid brand, channel or locale"},400);
    const pageType=b.pageType;
    const mode=b.mode;
    if((pageType!=="home"&&pageType!=="product")||(mode!=="page"&&mode!=="block"))
      return reply({error:"Invalid AI editing mode"},400);
    const prompt=b.prompt;
    if(typeof prompt!=="string"||prompt.trim().length<2||prompt.length>MAX_AI_PROMPT)
      return reply({error:"Enter 2–1200 characters"},400);
    const selectedId=typeof b.selectedId==="string"?b.selectedId:undefined;
    const document=validatedAiDocument(pageType,b.document);
    if(mode==="block"&&!document.content.some(block=>block.props.id===selectedId))
      return reply({error:"Choose an existing module"},400);
    const provider=await activeAiProvider(channel);
    if(!provider)return reply({error:"Add and activate an AI provider first"},409);

    // Best-effort local concurrency guard. For scale-out use an external shared
    // quota/rate limiter at the reverse proxy as well.
    const key=channel+":"+provider.id;
    const now=Date.now();
    if((cooldown.get(key)??0)>now)return reply({error:"Please allow a short interval between AI requests"},429);
    cooldown.set(key,now+12_000);
    if(cooldown.size>500)for(const [id,deadline] of cooldown)if(deadline<now)cooldown.delete(id);

    const currentBlock=mode==="block"?document.content.find(x=>x.props.id===selectedId):undefined;
    const context=mode==="block"?JSON.stringify(currentBlock):JSON.stringify(document);
    const history=validTurns(b.history);
    const messages=[
      {role:"system",content:aiSystemPrompt(pageType,mode)},
      ...history,
      {role:"user",content:`Current locale: ${locale}. Existing ${mode} JSON: ${context.slice(0,85_000)}\nOperator request: ${prompt.trim()}`},
    ];
    const response=await fetch(provider.baseUrl+"/chat/completions",{
      method:"POST",redirect:"error",cache:"no-store",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+provider.apiKey},
      body:JSON.stringify({
        model:provider.model,messages,
        ...(provider.baseUrl==="https://api.openai.com/v1"?{response_format:{type:"json_object"}}:{}),
      }),
      signal:AbortSignal.timeout(35_000),
    });
    if(!response.ok) {
      // Do not leak upstream URLs, headers, keys, or the response body into errors.
      return reply({error:response.status===401||response.status===403
        ?"Provider rejected the configured API key":"Model request failed ("+response.status+")"},502);
    }
    const bytes=await response.text();
    if(bytes.length>200_000)throw new ThemeValidationError("Model response too large");
    const output:unknown=JSON.parse(bytes);
    if(!output||typeof output!=="object"||!("choices" in output))
      throw new ThemeValidationError("Provider did not return chat completion choices");
    const result=output as {choices?:{message?:{content?:string|null}}[]};
    const content=result.choices?.[0]?.message?.content;
    if(!content)throw new ThemeValidationError("Model returned no page changes");
    const cleaned=content.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
    const proposal:unknown=JSON.parse(cleaned);
    const data=acceptAiProposal(pageType as AiPageType,mode as AiEditMode,document,selectedId,proposal);
    return reply({data,message:extractAiMessage(proposal),provider:provider.title,model:provider.model});
  } catch(error) {
    if(error instanceof ThemeValidationError||error instanceof SyntaxError)
      return reply({error:error instanceof SyntaxError?"Model did not return valid JSON":error.message},422);
    console.error("[theme-ai] AI generation failed");
    return reply({error:"AI generation unavailable; check provider configuration or try another model"},503);
  }
}
