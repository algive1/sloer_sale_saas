"use client";

import { googleAdsId, googleAdsPurchaseLabel, metaPixelId, tiktokPixelId } from "@/plugins/ads-tracking/config";
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

const pendingMetaEvents = new Map<string, PaperCommerceEvent>();
const pendingTikTokEvents = new Map<string, PaperCommerceEvent>();
let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlushAttempts = 0;
const MAX_PENDING_FLUSH_ATTEMPTS = 100;
const PENDING_FLUSH_INTERVAL_MS = 50;

function browserAdEventKey(event: PaperCommerceEvent): string {
	return event.eventId || JSON.stringify(event);
}

function sendMetaEvent(event: PaperCommerceEvent): boolean {
	const meta = projectMeta(event);
	if (!meta || !metaPixelId()) return true;
	if (typeof window.fbq !== "function") return false;

	if (event.eventId) {
		window.fbq("track", meta.name, meta.params, { eventID: event.eventId });
	} else {
		window.fbq("track", meta.name, meta.params);
	}
	return true;
}

function sendTikTokEvent(event: PaperCommerceEvent): boolean {
	const tiktok = projectTikTok(event);
	if (!tiktok || !tiktokPixelId()) return true;
	if (typeof window.ttq?.track !== "function") return false;

	if (event.eventId) {
		window.ttq.track(tiktok.name, tiktok.params, { event_id: event.eventId });
	} else {
		window.ttq.track(tiktok.name, tiktok.params);
	}
	return true;
}

/**
 * Flushes consented events that arrived in the short window between consent
 * being granted and a third-party browser SDK becoming ready.
 *
 * The queues are destination-specific: if Meta is ready before TikTok, Meta
 * can flush without causing a duplicate Meta send when TikTok becomes ready.
 */
function hasPendingBrowserAdEvents(): boolean {
	return pendingMetaEvents.size > 0 || pendingTikTokEvents.size > 0;
}

function stopPendingFlushScheduler(): void {
	if (pendingFlushTimer !== null) {
		clearTimeout(pendingFlushTimer);
		pendingFlushTimer = null;
	}
	pendingFlushAttempts = 0;
}

function schedulePendingFlush(): void {
	if (typeof window === "undefined" || pendingFlushTimer !== null || !hasPendingBrowserAdEvents()) return;
	if (pendingFlushAttempts >= MAX_PENDING_FLUSH_ATTEMPTS) {
		stopPendingFlushScheduler();
		return;
	}

	pendingFlushTimer = setTimeout(() => {
		pendingFlushTimer = null;
		pendingFlushAttempts += 1;
		flushBrowserAdEvents();
		if (hasPendingBrowserAdEvents()) {
			schedulePendingFlush();
		} else {
			stopPendingFlushScheduler();
		}
	}, PENDING_FLUSH_INTERVAL_MS);
}

export function flushBrowserAdEvents(): void {
	if (typeof window === "undefined") return;
	if (!adsStorageAllowed(readConsentChoice())) {
		pendingMetaEvents.clear();
		pendingTikTokEvents.clear();
		stopPendingFlushScheduler();
		return;
	}

	for (const [key, event] of pendingMetaEvents) {
		if (sendMetaEvent(event)) pendingMetaEvents.delete(key);
	}
	for (const [key, event] of pendingTikTokEvents) {
		if (sendTikTokEvent(event)) pendingTikTokEvents.delete(key);
	}

	if (hasPendingBrowserAdEvents()) {
		schedulePendingFlush();
	} else {
		stopPendingFlushScheduler();
	}
}

export function sendBrowserAdEvent(event: PaperCommerceEvent, context: BrowserAdContext = {}): void {
	if (typeof window === "undefined" || !adsStorageAllowed(readConsentChoice())) return;

	const key = browserAdEventKey(event);
	if (projectMeta(event) && metaPixelId()) {
		if (sendMetaEvent(event)) {
			pendingMetaEvents.delete(key);
		} else {
			pendingMetaEvents.set(key, event);
		}
	}

	if (projectTikTok(event) && tiktokPixelId()) {
		if (sendTikTokEvent(event)) {
			pendingTikTokEvents.delete(key);
		} else {
			pendingTikTokEvents.set(key, event);
		}
	}

	if (hasPendingBrowserAdEvents()) {
		schedulePendingFlush();
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
