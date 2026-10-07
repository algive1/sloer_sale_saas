"use client";

import { track } from "@vercel/analytics";
import { sendGa4Event } from "@/lib/analytics/browser";
import { sendBrowserAdEvent, type BrowserAdContext } from "@/lib/analytics/browser-ads";
import { sendFirstPartyCommerceEvent } from "@/lib/analytics/first-party-client";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { projectConsole } from "@/lib/analytics/destinations/console";
import { projectGa4 } from "@/lib/analytics/destinations/ga4";
import { projectVercel } from "@/lib/analytics/destinations/vercel";

export type ClientEmitOptions = BrowserAdContext & {
	/**
	 * Order confirmation uses ads-only because purchase was already recorded by
	 * the reliable server publisher. Browser pixels enrich/deduplicate that copy.
	 */
	coreDestinations?: boolean;
};

export function emitCommerceEvent(event: PaperCommerceEvent, options: ClientEmitOptions = {}): void {
	try {
		sendFirstPartyCommerceEvent(event);
		if (options.coreDestinations !== false) {
			const vercel = projectVercel(event);
			if (vercel) {
				track(vercel.name, vercel.props);
			}
			const ga4 = projectGa4(event);
			if (ga4) {
				sendGa4Event(ga4);
			}
			if (process.env.NODE_ENV === "development") {
				projectConsole(event);
			}
		}

		sendBrowserAdEvent(event, options);
	} catch (error) {
		console.warn("[analytics] destination failed", error);
	}
}
