"use client";

import { googleAdsId, googleAdsPurchaseLabel, metaPixelId, tiktokPixelId } from "@/lib/analytics/ad-platforms";
import { adsStorageAllowed } from "@/lib/analytics/consent";
import { readConsentChoice } from "@/lib/analytics/browser";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { claimOnce } from "@/lib/analytics/claim";
import { projectMeta, projectTikTok } from "@/lib/analytics/destinations/ads";
import { landingPathFromHref } from "@/lib/analytics/landing";

type TikTokQueue = {
	track?: (...args: unknown[]) => void;
	page?: () => void;
	grantConsent?: () => void;
	revokeConsent?: () => void;
};

declare global {
	interface Window {
		fbq?: (...args: unknown[]) => void;
		ttq?: TikTokQueue;
		gtag?: (...args: unknown[]) => void;
		dataLayer?: unknown[];
	}
}

export type BrowserAdContext = {
	userEmail?: string | null;
};

export function sendBrowserAdEvent(event: PaperCommerceEvent, context: BrowserAdContext = {}): void {
	if (typeof window === "undefined" || !adsStorageAllowed(readConsentChoice())) return;

	const meta = projectMeta(event);
	if (meta && metaPixelId() && typeof window.fbq === "function") {
		if (event.eventId) {
			window.fbq("track", meta.name, meta.params, { eventID: event.eventId });
		} else {
			window.fbq("track", meta.name, meta.params);
		}
	}

	const tiktok = projectTikTok(event);
	if (tiktok && tiktokPixelId() && typeof window.ttq?.track === "function") {
		if (event.eventId) {
			window.ttq.track(tiktok.name, tiktok.params, { event_id: event.eventId });
		} else {
			window.ttq.track(tiktok.name, tiktok.params);
		}
	}

	if (event.name === "checkout_completed") {
		sendGoogleAdsPurchase(event, context.userEmail);
	}
}

export function sendAdPageView(): void {
	if (typeof window === "undefined" || !adsStorageAllowed(readConsentChoice())) return;

	const canMeta = Boolean(metaPixelId() && typeof window.fbq === "function");
	const canTikTok = Boolean(tiktokPixelId() && typeof window.ttq?.page === "function");
	if (!canMeta && !canTikTok) return;

	const path = landingPathFromHref(window.location.href);

	if (canMeta && claimOnce(`paper.analytics.meta_page_view:${path}`)) {
		window.fbq?.("track", "PageView");
	}
	if (canTikTok && claimOnce(`paper.analytics.tiktok_page_view:${path}`)) {
		window.ttq?.page?.();
	}
}

function sendGoogleAdsPurchase(
	event: Extract<PaperCommerceEvent, { name: "checkout_completed" }>,
	userEmail?: string | null,
): void {
	const id = googleAdsId();
	const label = googleAdsPurchaseLabel();
	if (!id || !label) return;

	if (userEmail?.trim()) {
		googleTag("set", "user_data", { email: userEmail.trim().toLowerCase() });
	}

	googleTag("event", "conversion", {
		send_to: `${id}/${label}`,
		value: event.value,
		currency: event.currency,
		transaction_id: event.transactionId,
	});
}

function googleTag(...args: unknown[]): void {
	if (typeof window.gtag === "function") {
		window.gtag(...args);
		return;
	}
	window.dataLayer = window.dataLayer ?? [];
	window.dataLayer.push(args);
}
