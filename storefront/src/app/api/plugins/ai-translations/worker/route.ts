import { timingSafeEqual } from "node:crypto";
import { runTranslationWorker } from "@/plugins/ai-translations/worker";
import { translationDatabaseConfigured } from "@/plugins/ai-translations/store";

export async function POST(request:Request) {
  const secret=process.env.TRANSLATION_WORKER_SECRET?.trim()??"";
  if(secret.length<32)return new Response(null,{status:404});
  const header=request.headers.get("authorization")??"";
  const given=header.startsWith("Bearer ")?header.slice(7):"";
  if(given.length!==secret.length||!timingSafeEqual(Buffer.from(given),Buffer.from(secret))) {
    return new Response(null,{status:401});
  }
  if(!translationDatabaseConfigured())return new Response(null,{status:503});
  try {
    const result=await runTranslationWorker();
    return Response.json(result,{headers:{"cache-control":"no-store"}});
  }catch(error) {
    console.error("[translation-worker] tick failed",error instanceof Error?error.name:"unknown");
    return new Response(null,{status:503});
  }
}
