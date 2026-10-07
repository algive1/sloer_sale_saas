"use client";

import { useEffect } from "react";
import type { ProductCardData } from "./product-card-data";
import { claimOnce } from "@/lib/analytics/claim";
import { createCommerceEventId } from "@/lib/analytics/event-id";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";

export function ProductListAnalytics({
	products,
	listName,
}: {
	products: ProductCardData[];
	listName: string;
}) {
	useEffect(() => {
		const channel = products.find((product) => product.channel)?.channel;
		if (!channel || products.length === 0) return;
		const signature = products.map((product) => product.id).join(",");
		if (!claimOnce(`paper.analytics.list:${listName}:${signature}`)) return;
		emitCommerceEvent({
			name: "product_list_viewed",
			eventId: createCommerceEventId("list_view"),
			channel,
			listName,
			items: products.slice(0, 50).map((product) => ({
				itemId: product.id,
				itemName: product.name,
				price: product.price,
				quantity: 1,
			})),
		});
	}, [listName, products]);
	return null;
}
