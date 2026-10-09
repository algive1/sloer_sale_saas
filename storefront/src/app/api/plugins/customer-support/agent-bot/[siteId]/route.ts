import { NextResponse } from "next/server";
import { loadAIConfig } from "@/plugins/customer-support/ai/bot-config";
import { incomingBotMessage, verifyChatwootSignature } from "@/plugins/customer-support/ai/bot-policy";
import { enqueueAIBotMessage } from "@/plugins/customer-support/ai/bot-runtime";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_WEBHOOK_BYTES = 20_000;

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  if ((process.env.SUPPORT_AI_WORKER_SECRET?.trim().length ?? 0) < 32) {
    return new NextResponse(null, { status: 503 });
  }
  if (!analyticsDatabaseConfigured()) return new NextResponse(null, { status: 503 });

  let config: ReturnType<typeof loadAIConfig>;
  try { config = loadAIConfig(); }
  catch { return new NextResponse(null, { status: 503 }); }
  if (!config) return new NextResponse(null, { status: 404 });
  const { siteId } = await params;
  const bot = config.bots.find((entry) => entry.siteId === siteId);
  if (!bot) return new NextResponse(null, { status: 404 });

  const declared = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared > MAX_WEBHOOK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }
  let raw: string;
  try {
    // Enforce byte length on streamed requests, even when Content-Length is absent or forged.
    if (!request.body) return new NextResponse(null, { status: 400 });
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_WEBHOOK_BYTES) {
          await reader.cancel();
          return new NextResponse(null, { status: 413 });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!verifyChatwootSignature(raw, request.headers.get("x-chatwoot-signature"),
    request.headers.get("x-chatwoot-timestamp"), bot.webhookSecret)) {
    return new NextResponse(null, { status: 401 });
  }
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { return new NextResponse(null, { status: 400 }); }
  const event = incomingBotMessage(data);
  if (!event) return new NextResponse(null, { status: 204 });
  if (event.accountId !== bot.accountId || event.inboxId !== bot.inboxId) {
    return new NextResponse(null, { status: 403 });
  }

  try {
    await enqueueAIBotMessage(bot, event);
    return new NextResponse(null, { status: 204 });
  } catch {
    // No conversation/customer PII in HTTP errors or logs. Failed claims are retained for audit.
    return new NextResponse(null, { status: 503 });
  }
}
