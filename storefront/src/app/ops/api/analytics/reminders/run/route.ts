import { timingSafeEqual } from "crypto";
import { NextRequest,NextResponse } from "next/server";
import { runAutomaticReminders } from "@/plugins/payment-reminders/service";

function authorized(request:NextRequest, secret:string):boolean{
	const provided=request.headers.get("x-reminder-cron-secret")??"";
	const expected=new Uint8Array(Buffer.from(secret));
	const actual=new Uint8Array(Buffer.from(provided));
	// timingSafeEqual throws when lengths differ; a mismatch is already a denial.
	if(actual.length!==expected.length)return false;
	return timingSafeEqual(actual,expected);
}

export async function POST(request:NextRequest){
	const secret=process.env.PAYMENT_REMINDER_CRON_SECRET?.trim();
	if(!secret||!authorized(request,secret))return NextResponse.json({error:"unauthorized"},{status:401});
	try{return NextResponse.json(await runAutomaticReminders(),{headers:{"Cache-Control":"no-store"}});}
	catch{return NextResponse.json({error:"reminder_run_failed"},{status:503});}
}
