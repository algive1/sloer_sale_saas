"use client";

import { useEffect } from "react";
import { readConsentChoice } from "@/lib/analytics/browser";
import { claimOnce } from "@/lib/analytics/claim";
import {
	ANALYTICS_CONSENT_EVENT,
	analyticsStorageAllowed,
} from "@/lib/analytics/consent";
import { createCommerceEventId } from "@/lib/analytics/event-id";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";

export function ProductCommerceEvent({
	channel,
	productId,
	productName,
	categoryName,
	imageUrl,
	value,
	currency,
}: {
	channel: string;
	productId: string;
	productName: string;
	categoryName?: string;
	imageUrl?: string;
	value: number;
	currency: string;
}) {
	useEffect(() => {
		const key = `paper.analytics.product_viewed:${window.location.pathname}:${productId}`;

		const emitOnce = () => {
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
						productId,
						categoryName,
						imageUrl,
						itemName: productName,
						price: value,
						quantity: 1,
					},
				],
			});
		};

		const choice = readConsentChoice();
		if (choice === "denied" || analyticsStorageAllowed(choice)) {
			emitOnce();
			return;
		}

		const onConsent = () => emitOnce();
		window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent, { once: true });
		return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
	}, [channel, currency, productId, productName, categoryName, imageUrl, value]);

	return null;
}
