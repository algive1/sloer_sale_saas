import "server-only";
import { analyticsDatabaseConfigured,hranaRowsToObjects,libsqlPipeline } from "@/lib/analytics/libsql-http";
import { fetchSaleorOrders, type OpsOrder } from "@/lib/analytics/saleor-ops-orders";
import {reminderSkipReason,reminderDueStage,reminderCooldown} from "@/lib/analytics/reminder-policy";

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
  "您好，",
  "我们的记录显示，您的订单 #"+order.number+" 尚未完成付款。",
  "如果您仍希望购买，可打开订单查询页面，通过订单号及下单邮箱查看付款状态：",
  url,
  "若您已经付款，请忽略此邮件；系统以最终订单支付状态为准。",
  "谢谢。",
 ].join("\n\n");
 const response=await fetch("https://api.resend.com/emails",{
  method:"POST",signal:AbortSignal.timeout(10000),
  headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},
  body:JSON.stringify({from:fromEmail(),to:[order.email],subject:"订单 #"+order.number+" 付款提醒",text:body}),
 });
 if(!response.ok)throw new Error("email_delivery_http_"+response.status);
 const result=await response.json() as {id?:string};
 if(!result.id)throw new Error("email_provider_missing_message_id");
 return result.id;
}
export async function sendReminder(order:OpsOrder,stage:"manual"|"first"|"second"):Promise<ReminderResult>{
 if(!reminderEmailConfigured())return {status:"skipped",reason:"email_not_configured"};
 const invalid=reminderSkipReason(order);
 if(invalid)return {status:"skipped",reason:invalid};
 await schema();
 const now=new Date().toISOString();
 const [recent] = await libsqlPipeline([{sql:"SELECT MAX(sent_at) AS last_sent FROM ops_reminder_delivery WHERE order_id=? AND status='sent'",args:[order.id],wantRows:true}]);
 const lastSent=hranaRowsToObjects(recent)[0]?.last_sent;
 if(reminderCooldown(typeof lastSent==="string"?lastSent:null,Date.now()))return {status:"skipped",reason:"24_hour_cooldown"};
 const [claimed]=await libsqlPipeline([{sql:"INSERT OR IGNORE INTO ops_reminder_delivery(order_id,stage,status,claimed_at) VALUES(?,?,'sending',?)",args:[order.id,stage,now]}]);
 if(!claimed?.affected_row_count)return {status:"skipped",reason:"already_attempted"};
 try{
  const providerId=await sendEmail(order);
  await libsqlPipeline([{sql:"UPDATE ops_reminder_delivery SET status='sent',sent_at=?,provider_id=? WHERE order_id=? AND stage=?",args:[new Date().toISOString(),providerId,order.id,stage]}]);
  return {status:"sent"};
 }catch(error){
  await libsqlPipeline([{sql:"UPDATE ops_reminder_delivery SET status='failed',error=? WHERE order_id=? AND stage=?",args:[error instanceof Error?error.message.slice(0,160):"unknown_error",order.id,stage]}]);
  return {status:"failed",reason:"delivery_failed"};
 }
}
export async function sendManualReminder(orderId:string):Promise<ReminderResult>{
 // Verify unpaid/eligible against Saleor immediately before making a side effect.
 const orders=await fetchSaleorOrders(100);
 if(!orders)return {status:"skipped",reason:"saleor_unavailable"};
 const order=orders.find(o=>o.id===orderId);
 if(!order)return {status:"skipped",reason:"order_not_in_recent_window"};
 return sendReminder(order,"manual");
}
export async function runAutomaticReminders():Promise<{sent:number;skipped:number;failed:number}>{
 const rule=await getReminderRule();
 const result={sent:0,skipped:0,failed:0};
 if(!rule.enabled||!reminderEmailConfigured())return result;
 const orders=await fetchSaleorOrders(100);
 if(!orders)return result;
 await schema();
 const [daily]=await libsqlPipeline([{sql:"SELECT COUNT(*) AS count FROM ops_reminder_delivery WHERE claimed_at>=? AND status IN ('sending','sent','failed')",args:[new Date(Date.now()-86400000).toISOString()],wantRows:true}]);
 const count=Number(hranaRowsToObjects(daily)[0]?.count??0);
 const limit=Math.min(20,rule.dailyLimit);
 let attempts=count;
 for(const order of orders){
  if(attempts>=limit)break;
  if(reminderSkipReason(order)){result.skipped++;continue;}
  const [first]=await libsqlPipeline([{sql:"SELECT status FROM ops_reminder_delivery WHERE order_id=? AND stage='first'",args:[order.id],wantRows:true}]);
  const stage=reminderDueStage({createdAt:order.createdAt,firstHours:rule.firstAfterHours,secondHours:rule.secondAfterHours,firstSent:hranaRowsToObjects(first)[0]?.status==="sent",now:Date.now()});
  if(!stage){result.skipped++;continue;}
  const sent=await sendReminder(order,stage);
  if(sent.status==="sent"){result.sent++;attempts++;}
  else if(sent.status==="failed"){result.failed++;attempts++;}
  else result.skipped++;
 }
 return result;
}
