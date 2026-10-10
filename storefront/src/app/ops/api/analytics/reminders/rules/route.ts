import { NextRequest,NextResponse } from "next/server";
import { getReminderRule,setReminderRule,reminderEmailConfigured,reminderUnavailableReason } from "@/plugins/payment-reminders/service";
export async function GET(){
 try{return NextResponse.json({rule:await getReminderRule(),emailReady:reminderEmailConfigured()});}
 catch{return NextResponse.json({error:"reminder_unavailable"},{status:503});}
}
export async function POST(request:NextRequest){
 if(request.headers.get("x-requested-with")!=="analytics"||request.headers.get("sec-fetch-site")==="cross-site")return NextResponse.json({error:"forbidden"},{status:403});
 let input:unknown;try{input=await request.json();}catch{return NextResponse.json({error:"invalid_json"},{status:400});}
 if(!input||typeof input!=="object")return NextResponse.json({error:"invalid_rule"},{status:400});
 const r=input as Record<string,unknown>;
 if(typeof r.enabled!=="boolean"||typeof r.firstAfterHours!=="number"||!Number.isInteger(r.firstAfterHours)||typeof r.secondAfterHours!=="number"||!Number.isInteger(r.secondAfterHours)||typeof r.dailyLimit!=="number"||!Number.isInteger(r.dailyLimit))return NextResponse.json({error:"invalid_rule"},{status:400});
 const unavailable=reminderUnavailableReason();
 if(r.enabled&&unavailable)return NextResponse.json({error:unavailable},{status:409});
 if(r.enabled&&!process.env.PAYMENT_REMINDER_CRON_SECRET?.trim())return NextResponse.json({error:"cron_not_configured"},{status:409});
 try{return NextResponse.json({rule:await setReminderRule({enabled:r.enabled,firstAfterHours:Number(r.firstAfterHours),secondAfterHours:Number(r.secondAfterHours),dailyLimit:Number(r.dailyLimit)})});}
 catch{return NextResponse.json({error:"invalid_rule_or_database_unavailable"},{status:400});}
}
