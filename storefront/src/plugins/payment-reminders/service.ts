import "server-only";
import { analyticsDatabaseConfigured,hranaRowsToObjects,libsqlPipeline } from "@/lib/storage/libsql-http";
import { fetchSaleorOrdersPage, fetchSaleorOrder, type OpsOrder } from "@/lib/analytics/saleor-ops-orders";
import {reminderSkipReason,reminderDueStage,reminderCooldown} from "./policy";

export type PaymentReminderRule = { enabled:boolean; firstAfterHours:number; secondAfterHours:number; dailyLimit:number };
export type ReminderResult = { status:"sent"|"skipped"|"failed"; reason?:string };
const DEFAULT_RULE:PaymentReminderRule={enabled:false,firstAfterHours:24,secondAfterHours:72,dailyLimit:5};
const fromEmail=()=>process.env.PAYMENT_REMINDER_FROM?.trim()??"";
export function reminderEmailConfigured():boolean{
 return !!(process.env.RESEND_API_KEY?.trim()&&fromEmail()&&process.env.NEXT_PUBLIC_STOREFRONT_URL?.trim());
}
let initialized:Promise<void>|null=null;
async function schema(){
 if(!analyticsDatabaseConfigured())throw new Error("analytics_not_configured");
 if(!initialized)initialized=libsqlPipeline([
  {sql:"CREATE TABLE IF NOT EXISTS ops_reminder_rule (id INTEGER PRIMARY KEY CHECK (id=1), enabled INTEGER NOT NULL DEFAULT 0, first_after_hours INTEGER NOT NULL DEFAULT 24, second_after_hours INTEGER NOT NULL DEFAULT 72, daily_limit INTEGER NOT NULL DEFAULT 5, updated_at TEXT NOT NULL)"},
  {sql:"CREATE TABLE IF NOT EXISTS ops_reminder_delivery (order_id TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, claimed_at TEXT NOT NULL, sent_at TEXT, provider_id TEXT, error TEXT, PRIMARY KEY(order_id,stage))"},
 ]).then(()=>undefined).catch(e=>{initialized=null;throw e;});
 return initialized;
}
export async function getReminderRule():Promise<PaymentReminderRule>{
 await schema();
 const [result]=await libsqlPipeline([{sql:"SELECT enabled,first_after_hours,second_after_hours,daily_limit FROM ops_reminder_rule WHERE id=1",wantRows:true}]);
 const row=hranaRowsToObjects(result)[0];
 return row?{enabled:Number(row.enabled)===1,firstAfterHours:Number(row.first_after_hours),secondAfterHours:Number(row.second_after_hours),dailyLimit:Number(row.daily_limit)}:DEFAULT_RULE;
}
export async function setReminderRule(rule:PaymentReminderRule):Promise<PaymentReminderRule>{
 if(!Number.isInteger(rule.firstAfterHours)||rule.firstAfterHours<1||rule.firstAfterHours>168||
 !Number.isInteger(rule.secondAfterHours)||rule.secondAfterHours<=rule.firstAfterHours||rule.secondAfterHours>720||
 !Number.isInteger(rule.dailyLimit)||rule.dailyLimit<1||rule.dailyLimit>20)throw new Error("invalid_rule");
 await schema();
 await libsqlPipeline([{sql:"INSERT INTO ops_reminder_rule(id,enabled,first_after_hours,second_after_hours,daily_limit,updated_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,first_after_hours=excluded.first_after_hours,second_after_hours=excluded.second_after_hours,daily_limit=excluded.daily_limit,updated_at=excluded.updated_at",
 args:[rule.enabled?1:0,rule.firstAfterHours,rule.secondAfterHours,rule.dailyLimit,new Date().toISOString()]}]);
 return rule;
}

async function sendEmail(order:OpsOrder):Promise<string>{
 const apiKey=process.env.RESEND_API_KEY?.trim();
 const base=process.env.NEXT_PUBLIC_STOREFRONT_URL?.trim();
 if(!apiKey||!base||!fromEmail())throw new Error("email_not_configured");
 const url=new URL("/order/find",base).toString();
 const body=[
  "Hello,",
  "Our records indicate that payment for order #"+order.number+" is still pending.",
  "If you would like to complete your purchase, you can check your order using your order number and email address:",
  url,
  "If you have already paid, please disregard this message.",
  "Thank you.",
 ].join("\n\n");
 const response=await fetch("https://api.resend.com/emails",{
  method:"POST",signal:AbortSignal.timeout(10000),
  headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},
  body:JSON.stringify({from:fromEmail(),to:[order.email],subject:"Payment reminder for order #"+order.number,text:body}),
 });
 if(!response.ok)throw new Error("email_delivery_http_"+response.status);
 const result=await response.json() as {id?:string};
 if(!result.id)throw new Error("email_provider_missing_message_id");
 return result.id;
}
export async function sendReminder(order:OpsOrder,stage:"manual"|"first"|"second"):Promise<ReminderResult>{
 if(!reminderEmailConfigured())return {status:"skipped",reason:"email_not_configured"};
 // Re-read the authoritative order immediately before claiming a send slot.
 // A stale analytics list can outlive a successful payment or cancellation.
 const live=await fetchSaleorOrder(order.id);
 if(!live)return {status:"skipped",reason:"order_not_found_or_saleor_unavailable"};
 const invalid=reminderSkipReason(live);
 if(invalid)return {status:"skipped",reason:invalid};
 await schema();
 const rule=await getReminderRule();
 const [dailyCountResult]=await libsqlPipeline([{sql:"SELECT COUNT(*) AS count FROM ops_reminder_delivery WHERE claimed_at>=?",args:[new Date(Date.now()-86400000).toISOString()],wantRows:true}]);
 if(Number(hranaRowsToObjects(dailyCountResult)[0]?.count??0)>=rule.dailyLimit)return {status:"skipped",reason:"daily_limit"};
 const now=new Date().toISOString();
 const [recent] = await libsqlPipeline([{sql:"SELECT MAX(sent_at) AS last_sent FROM ops_reminder_delivery WHERE order_id=? AND status='sent'",args:[order.id],wantRows:true}]);
 const lastSent=hranaRowsToObjects(recent)[0]?.last_sent;
 if(reminderCooldown(typeof lastSent==="string"?lastSent:null,Date.now()))return {status:"skipped",reason:"24_hour_cooldown"};
 // Claim and enforce the global daily cap/order cooldown in one atomic SQLite write.
 // The earlier reads are advisory only; concurrent manual and Cron calls must not bypass limits.
 const [claimed]=await libsqlPipeline([{sql:`INSERT OR IGNORE INTO ops_reminder_delivery(order_id,stage,status,claimed_at)
 SELECT ?,?,'sending',?
 WHERE (SELECT COUNT(*) FROM ops_reminder_delivery WHERE claimed_at>=?) < ?
 AND NOT EXISTS (SELECT 1 FROM ops_reminder_delivery
   WHERE order_id=? AND (status='sending' OR (status='sent' AND sent_at>=?)))`,args:[order.id,stage,now,new Date(Date.now()-86400000).toISOString(),rule.dailyLimit,order.id,new Date(Date.now()-86400000).toISOString()]}]);
 if(!claimed?.affected_row_count)return {status:"skipped",reason:"already_attempted"};
 try{
  const providerId=await sendEmail(live);
  await libsqlPipeline([{sql:"UPDATE ops_reminder_delivery SET status='sent',sent_at=?,provider_id=? WHERE order_id=? AND stage=?",args:[new Date().toISOString(),providerId,order.id,stage]}]);
  return {status:"sent"};
 }catch(error){
  await libsqlPipeline([{sql:"UPDATE ops_reminder_delivery SET status='failed',error=? WHERE order_id=? AND stage=?",args:[error instanceof Error?error.message.slice(0,160):"unknown_error",order.id,stage]}]);
  return {status:"failed",reason:"delivery_failed"};
 }
}
export async function sendManualReminder(orderId:string):Promise<ReminderResult>{
 // Verify unpaid/eligible against Saleor immediately before making a side effect.
 const order=await fetchSaleorOrder(orderId);
 if(!order)return {status:"skipped",reason:"order_not_found_or_saleor_unavailable"};
 return sendReminder(order,"manual");
}
export type AutomaticReminderRun={sent:number;skipped:number;failed:number;scanned:number;truncated:boolean};
export async function runAutomaticReminders():Promise<AutomaticReminderRun>{
 const rule=await getReminderRule();
 const result:AutomaticReminderRun={sent:0,skipped:0,failed:0,scanned:0,truncated:false};
 if(!rule.enabled||!reminderEmailConfigured())return result;
 await schema();
 const [daily]=await libsqlPipeline([{sql:"SELECT COUNT(*) AS count FROM ops_reminder_delivery WHERE claimed_at>=?",args:[new Date(Date.now()-86400000).toISOString()],wantRows:true}]);
 let attempts=Number(hranaRowsToObjects(daily)[0]?.count??0);
 const limit=Math.min(20,rule.dailyLimit);
 // Do not contact people about arbitrarily old orders; paginate the relevant age window.
 const cutoff=Date.now()-(Math.max(rule.firstAfterHours,rule.secondAfterHours)+24)*3600000;
 let cursor:string|null=null;
 const MAX_PAGES=20;
 for(let pageIndex=0;pageIndex<MAX_PAGES;pageIndex++){
  if(attempts>=limit)break;
  const page=await fetchSaleorOrdersPage(100,cursor??undefined);
  if(!page)return result;
  let reachedCutoff=false;
  // One read per 100-order page rather than one remote LibSQL round trip per order.
  const pageIds=page.orders.map(o=>o.id);
  const firstStatus=new Map<string,string>();
  if(pageIds.length){
   const [firstRows]=await libsqlPipeline([{sql:"SELECT order_id,status FROM ops_reminder_delivery WHERE stage='first' AND order_id IN ("+pageIds.map(()=>"?").join(",")+")",args:pageIds,wantRows:true}]);
   for(const row of hranaRowsToObjects(firstRows))firstStatus.set(String(row.order_id),String(row.status));
  }
  for(const order of page.orders){
   if(attempts>=limit)break;
   const created=Date.parse(order.createdAt);
   if(!Number.isFinite(created)){result.skipped++;continue;}
   if(created<cutoff){reachedCutoff=true;break;}
   result.scanned++;
   if(reminderSkipReason(order)){result.skipped++;continue;}
   const stage=reminderDueStage({createdAt:order.createdAt,firstHours:rule.firstAfterHours,secondHours:rule.secondAfterHours,firstSent:firstStatus.get(order.id)==="sent",now:Date.now()});
   if(!stage){result.skipped++;continue;}
   const sent=await sendReminder(order,stage);
   if(sent.status==="sent"){result.sent++;attempts++;}
   else if(sent.status==="failed"){result.failed++;attempts++;}
   else result.skipped++;
  }
  if(reachedCutoff||!page.hasNextPage)break;
  if(!page.endCursor){result.truncated=true;break;}
  cursor=page.endCursor;
  if(pageIndex===MAX_PAGES-1)result.truncated=true;
 }
 return result;
}
