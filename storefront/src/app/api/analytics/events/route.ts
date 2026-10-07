import { NextResponse } from "next/server";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { storeFirstPartyCommerceEvent } from "@/lib/analytics/first-party-store";
import { analyticsDatabaseConfigured } from "@/lib/analytics/libsql-http";

export const runtime = "nodejs";

const ALLOWED_EVENTS = new Set([
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
	"refund_completed",
	"search_submitted",
]);

export async function POST(request: Request) {
	if (!analyticsDatabaseConfigured()) {
		return new NextResponse(null, { status: 204 });
	}
	const length = Number(request.headers.get("content-length") || "0");
	if (length > 32_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

	let event: PaperCommerceEvent;
	try {
		event = (await request.json()) as PaperCommerceEvent;
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}
	if (!event || typeof event !== "object" || !ALLOWED_EVENTS.has(event.name)) {
		return NextResponse.json({ error: "invalid_event" }, { status: 400 });
	}

	await storeFirstPartyCommerceEvent(event, request.headers);
	return new NextResponse(null, { status: 204 });
}
