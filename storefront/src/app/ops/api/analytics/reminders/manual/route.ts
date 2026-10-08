import { NextRequest,NextResponse } from "next/server";
import { sendManualReminder } from "@/lib/analytics/payment-reminders";
export async function POST(request:NextRequest){
 if(request.headers.get("x-requested-with")!=="analytics"||request.headers.get("sec-fetch-site")==="cross-site")return NextResponse.json({error:"forbidden"},{status:403});
 let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:"invalid_json"},{status:400});}
 const id=(body&&typeof body==="object"&&"orderId" in body)?(body as {orderId:unknown}).orderId:null;
 if(typeof id!=="string"||id.length<1||id.length>300)return NextResponse.json({error:"invalid_order_id"},{status:400});
 try{
  const result=await sendManualReminder(id);
  return NextResponse.json(result,{status:result.status==="failed"?502:result.status==="skipped"?409:200});
 }catch{return NextResponse.json({error:"reminder_unavailable"},{status:503});}
}