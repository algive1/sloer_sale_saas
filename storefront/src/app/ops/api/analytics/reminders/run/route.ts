import { NextRequest,NextResponse } from "next/server";
import { runAutomaticReminders } from "@/lib/analytics/payment-reminders";
export async function POST(request:NextRequest){
 const secret=process.env.PAYMENT_REMINDER_CRON_SECRET?.trim();
 if(!secret||request.headers.get("x-reminder-cron-secret")!==secret)return NextResponse.json({error:"unauthorized"},{status:401});
 try{return NextResponse.json(await runAutomaticReminders(),{headers:{"Cache-Control":"no-store"}});}
 catch{return NextResponse.json({error:"reminder_run_failed"},{status:503});}
}