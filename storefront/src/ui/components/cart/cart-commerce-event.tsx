"use client";

import { useEffect } from "react";
import type { CommerceItem } from "@/lib/analytics/catalog";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";
import { createCommerceEventId } from "@/lib/analytics/event-id";
import { claimOnce } from "@/lib/analytics/claim";

export function CartCommerceEvent({
	checkoutId,
	channel,
	value,
	currency,
	items,
}: {
	checkoutId: string;
	channel: string;
	value: number;
	currency: string;
	items: CommerceItem[];
}) {
	useEffect(() => {
		if (!claimOnce(`paper.analytics.cart_viewed:${checkoutId}:${window.location.pathname}`)) return;
		emitCommerceEvent({
			name: "cart_viewed",
			eventId: createCommerceEventId("cart_view", checkoutId),
			channel,
			value,
			currency,
			items,
		});
	}, [channel, checkoutId, currency, items, value]);
	return null;
}
