"use client";
import { clientAnalyticsActive } from "@/plugins/system/tracking-policy.client";

import { analyticsStorageAllowed } from "@/lib/analytics/consent";
import { readConsentChoice } from "@/lib/analytics/browser";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";

export function sendFirstPartyCommerceEvent(event: PaperCommerceEvent): void {
	if (!clientAnalyticsActive() || typeof window === "undefined" || !analyticsStorageAllowed(readConsentChoice())) return;
	const body = JSON.stringify(event);
	void fetch("/api/analytics/events", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
		keepalive: true,
		credentials: "same-origin",
	}).catch(() => undefined);
}
