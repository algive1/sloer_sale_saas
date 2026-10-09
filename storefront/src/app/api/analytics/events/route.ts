import { NextResponse } from "next/server";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { storeFirstPartyCommerceEvent } from "@/plugins/analytics/first-party-store";
import { analyticsDatabaseConfigured } from "@/lib/storage/libsql-http";
import { analyticsStorageAllowed } from "@/lib/analytics/consent";
import { ANALYTICS_CONSENT_COOKIE, parseConsentChoice } from "@/lib/analytics/cookies";

const MAX_BODY_BYTES = 32_000;

/**
 * Browser-originated behavioural events only.
 *
 * "refund_completed" is not included: only the signature-verified Saleor
 * /api/analytics/saleor-order-events webhook can persist refunds. The browser
 * must not be able to fabricate refunds and distort revenue reporting.
 */
const PUBLIC_EVENTS = new Set<PaperCommerceEvent["name"]>([
  "page_viewed",
  "product_list_viewed",
  "product_selected",
  "product_viewed",
  "wishlist_added",
  "wishlist_removed",
  "product_added_to_cart",
  "cart_viewed",
  "cart_item_removed",
  "cart_quantity_changed",
  "checkout_started",
  "checkout_step_viewed",
  "shipping_method_selected",
  "payment_method_selected",
  "payment_failed",
  "checkout_failed",
  "checkout_completed",
  "search_submitted",
]);

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const entry of header.split(";")) {
    const trimmed = entry.trim();
    if (trimmed.startsWith(name + "=")) return trimmed.slice(name.length + 1);
  }
  return null;
}

/** Abort oversized bodies without buffering an untrusted request in full. */
async function boundedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function POST(request: Request) {
  if (!analyticsDatabaseConfigured()) return new NextResponse(null, { status: 204 });

  // Consent is not only a UI concern: enforce the same policy at ingestion.
  // Disabled collection should not perform I/O or persist visitor data.
  const choice = parseConsentChoice(cookieValue(request, ANALYTICS_CONSENT_COOKIE));
  if (!analyticsStorageAllowed(choice)) return new NextResponse(null, { status: 204 });

  const declaredSize = Number(request.headers.get("content-length") || "0");
  if (declaredSize > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let event: PaperCommerceEvent;
  try {
    const raw = await boundedBody(request);
    if (raw === null) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    event = JSON.parse(raw) as PaperCommerceEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!event || typeof event !== "object" || !("name" in event) ||
      typeof event.name !== "string") {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }
  if (event.name === "refund_completed") {
    return NextResponse.json({ error: "server_only_event" }, { status: 403 });
  }
  if (!PUBLIC_EVENTS.has(event.name)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  await storeFirstPartyCommerceEvent(event, request.headers);
  return new NextResponse(null, { status: 204 });
}
