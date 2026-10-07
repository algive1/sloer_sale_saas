import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";
import { track } from "@vercel/analytics/server";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { projectConsole } from "@/lib/analytics/destinations/console";
import { deliverServerDestinations } from "@/lib/analytics/destinations/server-ads";
import { projectVercel } from "@/lib/analytics/destinations/vercel";
import { storeFirstPartyCommerceEvent } from "@/lib/analytics/first-party-store";
import { webAnalyticsEnabled } from "@/lib/analytics/web-analytics";

/**
 * Server publisher. Add-to-cart and purchase originate here only after Saleor
 * confirms the mutation. Vercel + GA4 Measurement Protocol + consented ad APIs
 * run in `after()` so they never hold open checkout mutations.
 */
export function emitCommerceEvent(event: PaperCommerceEvent): void {
	try {
		after(() => {
			void deliver(event);
		});
	} catch (error) {
		console.warn("[analytics] after() unavailable; dropping event", error);
	}
}

async function deliver(event: PaperCommerceEvent): Promise<void> {
	try {
		const requestHeaders = await headers();
		const jobs: Promise<unknown>[] = [
			deliverServerDestinations(event, requestHeaders),
			storeFirstPartyCommerceEvent(event, requestHeaders),
		];

		const vercel = projectVercel(event);
		if (vercel && webAnalyticsEnabled()) {
			jobs.push(track(vercel.name, vercel.props, { headers: requestHeaders }));
		}

		await Promise.allSettled(jobs);

		if (process.env.NODE_ENV === "development") {
			projectConsole(event);
		}
	} catch (error) {
		console.warn("[analytics] destination failed", error);
	}
}
