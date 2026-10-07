"use client";

import { useSyncExternalStore } from "react";
import { browserAdsConfigured } from "@/lib/analytics/ad-platforms";
import { readConsentChoice, setAnalyticsConsent } from "@/lib/analytics/browser";
import {
	ANALYTICS_CONSENT_EVENT,
	analyticsConsentMode,
	type AnalyticsConsentChoice,
} from "@/lib/analytics/consent";
import { Button } from "@/ui/components/ui/button";

type BannerState = AnalyticsConsentChoice | "loading" | null;

function subscribeToConsent(onStoreChange: () => void): () => void {
	window.addEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange);
	return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange);
}

function readBrowserConsent(): BannerState {
	return readConsentChoice();
}

function readServerConsent(): BannerState {
	return "loading";
}

/**
 * Compact binary consent choice for analytics + advertising. Advertising
 * remains opt-in even when analytics itself uses implied mode.
 */
export function AnalyticsConsentBanner() {
	const choice = useSyncExternalStore(subscribeToConsent, readBrowserConsent, readServerConsent);
	const shouldAsk = analyticsConsentMode() === "required" || browserAdsConfigured();
	if (!shouldAsk || choice === "loading" || choice) return null;

	const choose = (next: AnalyticsConsentChoice) => {
		setAnalyticsConsent(next);
	};

	return (
		<div
			role="dialog"
			aria-label="Analytics and advertising preferences"
			className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-xl border border-border bg-background p-4 shadow-lg sm:p-5"
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm leading-6 text-muted-foreground">
					We use analytics and advertising technologies to measure store performance and improve relevant
					ads. You can accept them or continue with essential cookies only.
				</p>
				<div className="flex shrink-0 gap-2">
					<Button type="button" variant="outline" onClick={() => choose("denied")}>
						Essential only
					</Button>
					<Button type="button" onClick={() => choose("granted")}>
						Accept
					</Button>
				</div>
			</div>
		</div>
	);
}
