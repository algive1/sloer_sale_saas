import { NextRequest } from "next/server";
import { getBrandSites, siteIdForChannel } from "@/config/brand-sites";
import { getStaticStorefrontChannelSlugs } from "@/config/channels";
import { TranslationConflict, TranslationInputError, validateScope } from "@/plugins/ai-translations/policy";
import { createJob, getJob, listJobs, publishReviewed, reviewItem, retryFailed, translationDatabaseConfigured } from "@/plugins/ai-translations/store";

const hdr={"cache-control":"private, no-store","x-content-type-options":"nosniff"};
const respond=(body:object,status=200)=>Response.json(body,{status,headers:hdr});
function allowedSite(id:string):boolean {
  const brands=getBrandSites();
  return brands?brands.some(s=>s.id===id):id===siteIdForChannel(getStaticStorefrontChannelSlugs()[0]??"");
}
function mutationAllowed(request:NextRequest):boolean {
  const origin=request.headers.get("origin");
  return !!origin && origin===request.nextUrl.origin && request.headers.get("sec-fetch-site")!=="cross-site" &&
    request.headers.get("content-type")?.startsWith("application/json")===true;
}
/** Existing Basic Auth middleware protects every /ops/ route. Never move under /api/. */
export async function GET(request:NextRequest) {
  if(!translationDatabaseConfigured())return respond({error:"翻译数据库未配置"},503);
  const siteId=request.nextUrl.searchParams.get("siteId")??"";
  if(!allowedSite(siteId))return respond({error:"未知品牌"},404);
  try {
    const jobId=request.nextUrl.searchParams.get("jobId");
    if(jobId) {
      if(!/^[0-9a-f-]{36}$/.test(jobId))return respond({error:"任务 ID 无效"},400);
      const detail=await getJob(siteId,jobId);
      return detail?respond(detail):respond({error:"任务不存在"},404);
    }
    return respond({jobs:await listJobs(siteId)});
  }catch{return respond({error:"翻译存储暂不可用"},503);}
}
export async function POST(request:NextRequest) {
  if(!mutationAllowed(request))return respond({error:"跨站修改被拒绝"},403);
  if(!translationDatabaseConfigured())return respond({error:"翻译数据库未配置"},503);
  try {
    const text=await request.text();
    if(text.length>20000)return respond({error:"请求过大"},413);
    const body:unknown=JSON.parse(text);
    if(!body || typeof body!=="object" || Array.isArray(body))return respond({error:"参数无效"},400);
    const data=body as Record<string,unknown>;
    const scope=validateScope(data);
    if(data.action==="create") {
      const count=data.count;
      if(typeof count!=="number"||!Number.isSafeInteger(count)||count<1||count>10)return respond({error:"每批商品数量必须在 1–10 之间"},400);
      return respond({job:await createJob(scope,count)},201);
    }
    if(typeof data.jobId!=="string"||!/^[0-9a-f-]{36}$/.test(data.jobId) ||
       typeof data.itemId!=="string"||data.itemId.length>350 ||
       typeof data.revision!=="number")return respond({error:"任务项目或版本无效"},400);
    if(data.action==="retry") {
      await retryFailed(scope,data.jobId,data.itemId,data.revision);
      return respond({ok:true});
    }
    if(data.action==="publish") {
      await publishReviewed(scope,data.jobId,data.itemId,data.revision);
      return respond({ok:true});
    }
    if(data.action==="approve"||data.action==="reject"||data.action==="edit") {
      return respond({item:await reviewItem(scope,data.jobId,data.itemId,data.revision,
        data.action,data.translation)});
    }
    return respond({error:"未知操作"},400);
  }catch(error) {
    if(error instanceof TranslationInputError||error instanceof SyntaxError)return respond({error:error.message},400);
    if(error instanceof TranslationConflict)return respond({error:error.message},409);
    console.error("[ops/translations] request failed",error instanceof Error?error.name:"unknown");
    return respond({error:"翻译操作暂不可用"},503);
  }
}
