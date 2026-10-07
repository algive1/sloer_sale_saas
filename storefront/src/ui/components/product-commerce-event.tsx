"use client";

import { useEffect } from "react";
import { claimOnce } from "@/lib/analytics/claim";
import { createCommerceEventId } from "@/lib/analytics/event-id";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";

export function ProductCommerceEvent({
	channel,
	productId,
	productName,
	value,
	currency,
}: {
	channel: string;
	productId: string;
	productName: string;
	value: number;
	currency: string;
}) {
	useEffect(() => {
		const key = `paper.analytics.product_viewed:${window.location.pathname}:${productId}`;
		if (!claimOnce(key)) return;

		emitCommerceEvent({
			name: "product_viewed",
			eventId: createCommerceEventId("view", `${window.location.pathname}:${productId}`),
			channel,
			value,
			currency,
			items: [
				{
					itemId: productId,
					itemName: productName,
					price: value,
					quantity: 1,
				},
			],
		});
	}, [channel, currency, productId, productName, value]);

	return null;
}
