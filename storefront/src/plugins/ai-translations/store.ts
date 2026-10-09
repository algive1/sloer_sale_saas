import "server-only";
import { randomUUID } from "node:crypto";
import { hranaRowsToObjects, libsqlPipeline } from "@/lib/storage/libsql-http";
import { freshProduct, listSourceProducts, publishProductTranslation } from "./saleor";
import { mayPublishInScope, parseStoredFields, parseTranslation, TranslationConflict,
  TranslationInputError, type TranslationScope, type TranslatedFields } from "./policy";

type Row = Record<string,unknown>;
export type ItemStatus = "queued" | "processing" | "draft" | "approved" | "rejected" |
  "failed" | "publishing" | "published" | "needs_reconciliation";
export type TranslationItem = {itemId:string;jobId:string;productId:string;slug:string;sourceHash:string;
  source:TranslatedFields; translation:TranslatedFields|null; status:ItemStatus;revision:number;updatedAt:string};
export type TranslationJob = TranslationScope & {id:string;createdAt:string;updatedAt:string;total:number;
  queued:number;draft:number;approved:number;published:number;failed:number};

let setup:Promise<void>|null=null;
const conn = () => {
  const dedicatedUrl=process.env.TRANSLATION_LIBSQL_URL?.trim();
  const dedicatedToken=process.env.TRANSLATION_LIBSQL_AUTH_TOKEN?.trim();
  if (dedicatedUrl || dedicatedToken) {
    if (!dedicatedUrl || !dedicatedToken) throw new Error("翻译数据库专用地址与密钥必须一起配置");
    return {url:dedicatedUrl,token:dedicatedToken};
  }
  const url=process.env.ANALYTICS_LIBSQL_URL?.trim();
  const token=process.env.ANALYTICS_LIBSQL_AUTH_TOKEN?.trim();
  if (!url || !token) throw new Error("翻译持久化数据库未配置");
  return {url,token};
};
export function translationDatabaseConfigured():boolean {
  try { conn(); return true; } catch { return false; }
}
async function sql(query:string,args:(string|number|null)[]=[],read=false) {
  const [data] = await libsqlPipeline([{sql:query,args,wantRows:read}],conn());
  return { rows: hranaRowsToObjects(data), changed: data?.affected_row_count??0 };
}
async function schema():Promise<void> {
  if (!setup) setup=(async()=>{
    await libsqlPipeline([
      {sql:"CREATE TABLE IF NOT EXISTS ops_translation_jobs (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, channel TEXT NOT NULL, locale TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"},
      {sql:"CREATE TABLE IF NOT EXISTS ops_translation_items (job_id TEXT NOT NULL, item_id TEXT NOT NULL, product_id TEXT NOT NULL, slug TEXT NOT NULL, source_hash TEXT NOT NULL, source_json TEXT NOT NULL, translation_json TEXT, status TEXT NOT NULL CHECK(status IN ('queued','processing','draft','approved','rejected','failed','publishing','published','needs_reconciliation')), revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(job_id,item_id))"},
      {sql:"CREATE INDEX IF NOT EXISTS ops_translation_items_status_idx ON ops_translation_items(status,updated_at)"}
    ],conn());
  })().catch(e=>{setup=null;throw e;});
  await setup;
}
const s=(r:Row,k:string)=>String(r[k]??"");
const n=(r:Row,k:string)=>Number(r[k]??0);
function jobRow(r:Row):TranslationJob {
  return {id:s(r,"id"),siteId:s(r,"site_id"),channel:s(r,"channel"),
    locale:s(r,"locale") as TranslationScope["locale"],createdAt:s(r,"created_at"),updatedAt:s(r,"updated_at"),
    total:n(r,"total"),queued:n(r,"queued"),draft:n(r,"draft"),approved:n(r,"approved"),
    published:n(r,"published"),failed:n(r,"failed")};
}
function itemRow(r:Row):TranslationItem {
  return {jobId:s(r,"job_id"),itemId:s(r,"item_id"),productId:s(r,"product_id"),
    slug:s(r,"slug"),sourceHash:s(r,"source_hash"),source:parseStoredFields(r.source_json),
    translation:typeof r.translation_json==="string"?parseStoredFields(r.translation_json):null,
    status:s(r,"status") as ItemStatus,revision:n(r,"revision"),updatedAt:s(r,"updated_at")};
}
const JOB_SELECT = "SELECT j.*, COUNT(i.item_id) AS total," +
  " SUM(CASE WHEN i.status IN ('queued','processing') THEN 1 ELSE 0 END) AS queued,"+
  " SUM(CASE WHEN i.status IN ('draft','rejected') THEN 1 ELSE 0 END) AS draft,"+
  " SUM(CASE WHEN i.status='approved' THEN 1 ELSE 0 END) AS approved,"+
  " SUM(CASE WHEN i.status='published' THEN 1 ELSE 0 END) AS published,"+
  " SUM(CASE WHEN i.status IN ('failed','needs_reconciliation') THEN 1 ELSE 0 END) AS failed"+
  " FROM ops_translation_jobs j LEFT JOIN ops_translation_items i ON i.job_id=j.id";

export async function listJobs(siteId:string,limit=30):Promise<TranslationJob[]> {
  await schema();
  const r=await sql(JOB_SELECT+" WHERE j.site_id=? GROUP BY j.id ORDER BY j.created_at DESC LIMIT ?",[siteId,limit],true);
  return r.rows.map(jobRow);
}
export async function getJob(siteId:string,jobId:string):Promise<{job:TranslationJob;items:TranslationItem[]}|null> {
  await schema();
  const r=await sql(JOB_SELECT+" WHERE j.id=? AND j.site_id=? GROUP BY j.id LIMIT 1",[jobId,siteId],true);
  if (!r.rows.length) return null;
  const items=await sql("SELECT i.* FROM ops_translation_items i JOIN ops_translation_jobs j ON j.id=i.job_id WHERE j.id=? AND j.site_id=? ORDER BY i.rowid ASC",[jobId,siteId],true);
  return {job:jobRow(r.rows[0]),items:items.rows.map(itemRow)};
}

export async function createJob(scope:TranslationScope,count:number):Promise<TranslationJob> {
  if (!Number.isInteger(count)||count<1||count>10) throw new TranslationInputError("每批最多 10 件商品");
  await schema();
  // Repeated button clicks/retries return the existing active batch rather than
  // creating duplicate model spend and conflicting approval work.
  const ongoing=await sql("SELECT j.id FROM ops_translation_jobs j JOIN ops_translation_items i ON i.job_id=j.id "+
    "WHERE j.site_id=? AND j.channel=? AND j.locale=? AND i.status IN ('queued','processing','draft','approved','publishing') "+
    "ORDER BY j.created_at DESC LIMIT 1",[scope.siteId,scope.channel,scope.locale],true);
  if(ongoing.rows.length) {
    const current=await getJob(scope.siteId,s(ongoing.rows[0],"id"));
    if(current)return current.job;
  }
  // Read from authoritative Saleor; never accept client-supplied product copy or IDs.
  const products=await listSourceProducts(scope.channel,count);
  if (!products.length) throw new TranslationInputError("该市场没有可翻译商品");
  const id=randomUUID(),now=new Date().toISOString();
  await sql("INSERT INTO ops_translation_jobs (id,site_id,channel,locale,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    [id,scope.siteId,scope.channel,scope.locale,now,now]);
  for(const p of products) {
    await sql("INSERT INTO ops_translation_items (job_id,item_id,product_id,slug,source_hash,source_json,status,updated_at) VALUES (?,?,?,?,?,?,'queued',?)",
      [id,p.id,p.id,p.slug,p.hash,JSON.stringify(p.source),now]);
  }
  const result=await getJob(scope.siteId,id);
  if (!result) throw new Error("新建翻译任务后无法读取");
  return result.job;
}

export async function reviewItem(scope:TranslationScope,jobId:string,itemId:string,revision:number,
  action:"approve"|"reject"|"edit",manual?:unknown):Promise<TranslationItem> {
  if (!Number.isSafeInteger(revision)||revision<0) throw new TranslationInputError("需要有效版本号");
  const job=await getJob(scope.siteId,jobId);
  if (!job || job.job.channel!==scope.channel || job.job.locale!==scope.locale) throw new TranslationInputError("任务不存在");
  const item=job.items.find(i=>i.itemId===itemId);
  if (!item) throw new TranslationInputError("任务项目不存在");
  if (!["draft","approved","rejected"].includes(item.status)) throw new TranslationConflict("尚未生成草稿，不能审核");
  if (revision!==item.revision) throw new TranslationConflict("草稿已经被其他管理员修改");
  const candidate=manual!==undefined?manual:item.translation;
  const translation=action==="reject"?item.translation:parseTranslation(item.source,candidate);
  const status=action==="approve"?"approved":action==="reject"?"rejected":"draft";
  const result=await sql("UPDATE ops_translation_items SET status=?,translation_json=?,revision=revision+1,updated_at=? WHERE job_id=? AND item_id=? AND revision=? AND status IN ('draft','approved','rejected')",
    [status,translation?JSON.stringify(translation):null,new Date().toISOString(),jobId,itemId,revision]);
  if(result.changed!==1)throw new TranslationConflict("版本冲突，请重新载入");
  const next=await getJob(scope.siteId,jobId);
  return next!.items.find(i=>i.itemId===itemId)!;
}

export async function claimNext():Promise<TranslationItem|null> {
  await schema();
  // A crashed worker can leave an AI-only processing claim stranded. Two attempts
  // maximum; publishing claims are deliberately NEVER recovered automatically.
  await sql("UPDATE ops_translation_items SET status='queued',revision=revision+1,updated_at=? "+
    "WHERE status='processing' AND revision<3 AND updated_at<?",[
    new Date().toISOString(),new Date(Date.now()-15*60_000).toISOString(),
  ]);
  const result=await sql("SELECT * FROM ops_translation_items WHERE status='queued' ORDER BY updated_at ASC LIMIT 1",[],true);
  if (!result.rows.length) return null;
  const item=itemRow(result.rows[0]);
  const changed=await sql("UPDATE ops_translation_items SET status='processing',revision=revision+1,updated_at=? WHERE job_id=? AND item_id=? AND status='queued' AND revision=?",
    [new Date().toISOString(),item.jobId,item.itemId,item.revision]);
  return changed.changed===1?{...item,status:"processing",revision:item.revision+1}:null;
}
export async function claimScope(item:TranslationItem):Promise<TranslationScope> {
  const r=await sql("SELECT site_id,channel,locale FROM ops_translation_jobs WHERE id=? LIMIT 1",[item.jobId],true);
  if (!r.rows.length) throw new Error("任务不存在");
  return {siteId:s(r.rows[0],"site_id"),channel:s(r.rows[0],"channel"),locale:s(r.rows[0],"locale") as TranslationScope["locale"]};
}
export async function completeGenerated(item:TranslationItem,translation:TranslatedFields|null):Promise<void> {
  await sql("UPDATE ops_translation_items SET status=?,translation_json=?,revision=revision+1,updated_at=? WHERE job_id=? AND item_id=? AND status='processing' AND revision=?",
    [translation?"draft":"failed",translation?JSON.stringify(translation):null,new Date().toISOString(),
     item.jobId,item.itemId,item.revision]);
}
export async function retryFailed(scope:TranslationScope,jobId:string,itemId:string,revision:number):Promise<void> {
  const data=await getJob(scope.siteId,jobId);
  if(!data||data.job.channel!==scope.channel||data.job.locale!==scope.locale)
    throw new TranslationInputError("任务不存在");
  const item=data.items.find(i=>i.itemId===itemId);
  if(!item||item.status!=="failed"||item.revision!==revision)
    throw new TranslationConflict("只有生成失败的条目可以重试");
  const result=await sql("UPDATE ops_translation_items SET status='queued',revision=revision+1,updated_at=? "+
    "WHERE job_id=? AND item_id=? AND status='failed' AND revision=?",[
      new Date().toISOString(),jobId,itemId,revision,
    ]);
  if(result.changed!==1)throw new TranslationConflict("任务已被其他管理员更新");
}

export async function publishReviewed(scope:TranslationScope,jobId:string,itemId:string,revision:number):Promise<void> {
  mayPublishInScope(scope);
  const job=await getJob(scope.siteId,jobId);
  if(!job||job.job.channel!==scope.channel||job.job.locale!==scope.locale)throw new TranslationInputError("任务不存在");
  const item=job.items.find(i=>i.itemId===itemId);
  if (!item||item.status!=="approved"||item.revision!==revision||!item.translation)throw new TranslationConflict("请先审核，或刷新版本后重试");
  const latest=await freshProduct(scope,item.productId);
  if (latest.product.hash!==item.sourceHash) throw new TranslationConflict("商品英文内容已变化，请重新翻译");
  if (latest.existing&&Object.keys(latest.existing).length>0)throw new TranslationConflict("Saleor 已有人工译文，禁止覆盖");
  const claim=await sql("UPDATE ops_translation_items SET status='publishing',revision=revision+1,updated_at=? WHERE job_id=? AND item_id=? AND revision=? AND status='approved'",
    [new Date().toISOString(),jobId,itemId,revision]);
  if(claim.changed!==1)throw new TranslationConflict("发布被其他管理员占用");
  try {
    const secondCheck=await freshProduct(scope,item.productId);
    if(secondCheck.product.hash!==item.sourceHash || (secondCheck.existing && Object.keys(secondCheck.existing).length)) {
      throw new TranslationConflict("发布前 Saleor 商品或译文已更新");
    }
    await publishProductTranslation(scope,item.productId,parseTranslation(item.source,item.translation));
    await sql("UPDATE ops_translation_items SET status='published',revision=revision+1,updated_at=? WHERE job_id=? AND item_id=? AND status='publishing'",
      [new Date().toISOString(),jobId,itemId]);
  } catch {
    // A timeout can occur *after* Saleor saved the translation. Never auto-retry.
    await sql("UPDATE ops_translation_items SET status='needs_reconciliation',revision=revision+1,updated_at=? WHERE job_id=? AND item_id=? AND status='publishing'",
      [new Date().toISOString(),jobId,itemId]);
    throw new TranslationConflict("发布结果不确定，请到 Saleor 核对，禁止盲目重试");
  }
}
