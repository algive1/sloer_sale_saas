import { NextRequest, NextResponse } from "next/server";
import type { CommerceItem, PaperCommerceEvent } from "@/lib/analytics/catalog";
import { deliverGa4ServerEvent } from "@/lib/analytics/destinations/server-ads";
import {
	recordRefundTotal,
	storeFirstPartyCommerceEvent,
} from "@/plugins/analytics/first-party-store";
import { verifyWebhookSignature } from "@/lib/api-auth";


type Money = { amount?: number | string | null; currency?: string | null };
type MetadataItem = { key?: string | null; value?: string | null };
type OrderPayload = {
	id?: string | null;
	channel?: { slug?: string | null } | null;
	totalRefunded?: Money | null;
	metadata?: MetadataItem[] | null;
	lines?: Array<{
		id?: string | null;
		productName?: string | null;
		variantName?: string | null;
		productSku?: string | null;
		productVariantId?: string | null;
		quantity?: number | null;
		unitPrice?: { gross?: Money | null } | null;
	}> | null;
};

export async function POST(request: NextRequest) {
	const raw = await request.text();
	if (!verifyWebhookSignature(raw, request.headers.get("saleor-signature"))) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	const eventType = request.headers.get("saleor-event")?.toUpperCase();
	if (eventType !== "ORDER_REFUNDED" && eventType !== "ORDER_FULLY_REFUNDED") {
		return NextResponse.json({ skipped: true, reason: "unhandled_event" });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}
	const order = extractOrder(payload);
	if (!order?.id || !order.totalRefunded) {
		return NextResponse.json({ error: "missing_order_refund_fields" }, { status: 400 });
	}

	const currency = order.totalRefunded.currency?.trim() || "";
	const cumulative = Number(order.totalRefunded.amount ?? 0);
	if (!currency || !Number.isFinite(cumulative) || cumulative <= 0) {
		return NextResponse.json({ skipped: true, reason: "zero_refund" });
	}

	const delta = await recordRefundTotal(order.id, cumulative, currency);
	if (delta <= 0) {
		return NextResponse.json({ skipped: true, reason: "already_processed" });
	}

	const event: PaperCommerceEvent = {
		name: "refund_completed",
		eventId: `refund:${order.id}:${cumulative}`,
		channel: order.channel?.slug ?? "",
		value: delta,
		currency,
		transactionId: order.id,
		items: orderItems(order),
	};

	await storeFirstPartyCommerceEvent(event, request.headers);
	if (analyticsEligible(order.metadata)) {
		await deliverGa4ServerEvent(event, request.headers);
	}
	return NextResponse.json({ success: true, orderId: order.id, refundDelta: delta, currency });
}

function extractOrder(payload: unknown): OrderPayload | null {
	if (!payload || typeof payload !== "object") return null;
	const root = payload as Record<string, unknown>;
	const event = root.event && typeof root.event === "object" ? (root.event as Record<string, unknown>) : root;
	const order = event.order ?? root.order;
	return order && typeof order === "object" ? (order as OrderPayload) : null;
}

function analyticsEligible(metadata: MetadataItem[] | null | undefined): boolean {
	const raw = metadata?.find((item) => item.key === "commerce.context.origin")?.value;
	if (!raw) return false;
	try {
		const origin = JSON.parse(raw) as { consent?: string };
		return origin.consent === "granted" || origin.consent === "not_required";
	} catch {
		return false;
	}
}

function orderItems(order: OrderPayload): CommerceItem[] {
	return (order.lines ?? []).map((line) => ({
		itemId: line.productVariantId || line.id || "unknown",
		variantId: line.productVariantId || undefined,
		sku: line.productSku ?? undefined,
		itemName: line.productName
			? line.variantName && line.variantName !== line.productName
				? `${line.productName} — ${line.variantName}`
				: line.productName
			: line.variantName ?? undefined,
		price: Number(line.unitPrice?.gross?.amount ?? 0),
		quantity: Math.max(1, line.quantity ?? 1),
	}));
}
