import { createHmac, timingSafeEqual } from "node:crypto";
import type { PublishedFaq } from "./bot-config";

export function verifyChatwootSignature(
  raw: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!timestamp || !/^[0-9]{10,11}$/.test(timestamp) ||
      !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const signedAt = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(signedAt) || Math.abs(nowMs - signedAt) > 300_000) return false;
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(timestamp + "." + raw, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export type IncomingBotMessage = Readonly<{
  messageId: string;
  accountId: number;
  inboxId: number;
  conversationId: number;
  question: string;
}>;
function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function intId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^[0-9]+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
export function incomingBotMessage(payload: unknown): IncomingBotMessage | null {
  const event = rec(payload);
  const conversation = rec(event.conversation);
  const account = rec(event.account);
  const inbox = rec(event.inbox);
  if (event.event !== "message_created" ||
      (event.message_type !== "incoming" && event.message_type !== 0) ||
      event.private === true) return null;
  const messageId = intId(event.id);
  const accountId = intId(account.id);
  const inboxId = intId(conversation.inbox_id ?? inbox.id);
  // Chatwoot v4.18 webhook conversation.webhook_data uses `id`, not `display_id`.
  // `id` is the per-Account display ID expected by /conversations/:id.
  const conversationId = intId(conversation.id);
  const question = event.content_type === "text" && typeof event.content === "string" &&
    event.content.trim().length > 0 && event.content.length <= 1000 ? event.content.trim() : "";
  if (!messageId || !accountId || !inboxId || !conversationId) return null;
  // Non-text or oversized visitor input must be handed to a human, not silently ignored.
  return { messageId: String(messageId), accountId, inboxId, conversationId, question };
}

/** Customer data must not be sent to a language model without a verified authorization path. */
export function requiresHuman(question: string): boolean {
  return /\b(order|refund|payment|cancel|address|credit.card|tracking|my.package|my.parcel|invoice|account|password|chargeback|human|person|live.agent|representative|speak.to.someone)\b/i.test(question) ||
    /(订单|退款|支付|付款|收货地址|信用卡|账单|账户|密码|取消订单|物流单号|人工|真人|转接客服|返金|注文|支払い|請求|オペレーター|担当者)/.test(question) ||
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(question) ||
    /\b(?:\d[ -]?){12,19}\b/.test(question);
}

export function faqCandidates(faqs: readonly PublishedFaq[], siteId: string, question: string): PublishedFaq[] {
  const clean = question.trim().toLowerCase();
  const scored = faqs.filter((f) => f.siteId === siteId).map((f) => {
    const terms = [...f.keywords, f.question].map((x) => x.toLowerCase().trim());
    const score = terms.reduce((sum, term) => sum + (term.length > 1 && clean.includes(term) ? 1 : 0), 0);
    return { f, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((x) => x.f);
}

export function extractSelectedFaq(modelOutput: unknown, candidates: readonly PublishedFaq[]): PublishedFaq | null {
  if (typeof modelOutput !== "string" || modelOutput.length > 200) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(modelOutput); } catch { return null; }
  const value = rec(parsed).id;
  if (typeof value !== "string") return null;
  return candidates.find((f) => f.id === value) ?? null;
}
