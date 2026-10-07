"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { sendRedactedPageView } from "@/lib/analytics/browser";
import { sendAdPageView } from "@/lib/analytics/browser-ads";
import { readConsentChoice } from "@/lib/analytics/browser";
import { ANALYTICS_CONSENT_EVENT, analyticsStorageAllowed } from "@/lib/analytics/consent";
import { claimOnce } from "@/lib/analytics/claim";
import { createCommerceEventId } from "@/lib/analytics/event-id";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";

/**
 * Redacted merchant-tag page views on pathname change (not `?step=`).
 * Must stay inside `<Suspense>` — `usePathname` suspends on fallback params.
 * https://nextjs.org/docs/messages/blocking-prerender-client-hook
 */
export function AnalyticsPathnameViews() {
	const pathname = usePathname();
	const params = useParams<{ channel?: string }>();

	useEffect(() => {
		if (!pathname) return;
		sendRedactedPageView();
		sendAdPageView();

		const sendFirstPartyPageView = () => {
			if (!analyticsStorageAllowed(readConsentChoice())) return;
			if (!claimOnce(`paper.analytics.first_party_page_view:${pathname}`)) return;
			emitCommerceEvent({
				name: "page_viewed",
				eventId: createCommerceEventId("page_view"),
				channel: params.channel ?? "",
				path: pathname,
			});
		};
		sendFirstPartyPageView();
		window.addEventListener(ANALYTICS_CONSENT_EVENT, sendFirstPartyPageView);
		return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sendFirstPartyPageView);
	}, [params.channel, pathname]);

	return null;
}
