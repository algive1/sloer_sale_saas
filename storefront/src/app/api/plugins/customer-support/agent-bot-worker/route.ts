import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";
import { loadAIConfig } from "@/plugins/customer-support/ai/bot-config";
import { runQueuedAIBot } from "@/plugins/customer-support/ai/bot-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const given = header.slice(7);
  if (given.length !== secret.length || given.length < 32) return false;
  return timingSafeEqual(Buffer.from(given),Buffer.from(secret));
}

/** Self-hosted cron / dedicated worker calls this; no AI processing in storefront requests. */
export async function POST(request: Request) {
  const secret = process.env.SUPPORT_AI_WORKER_SECRET?.trim() ?? "";
  if (secret.length < 32) return new NextResponse(null,{status:404});
  if (!authorized(request,secret)) return new NextResponse(null,{status:401});
  if (!analyticsDatabaseConfigured()) return new NextResponse(null,{status:503});

  let config: ReturnType<typeof loadAIConfig>;
  try { config = loadAIConfig(); }
  catch { return new NextResponse(null,{status:503}); }
  if (!config) return new NextResponse(null,{status:204});
  try {
    // One event per invocation bounds latency; independent workers can safely race
    // because the database atomically transitions queued -> processing.
    const result = await runQueuedAIBot(config,1);
    return NextResponse.json(result,{headers:{"cache-control":"no-store"}});
  } catch {
    return new NextResponse(null,{status:503});
  }
}
