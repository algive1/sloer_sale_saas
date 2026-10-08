import { Suspense } from "react";
import { analyticsConsentMode } from "@/lib/analytics/consent";
import { gaMeasurementId } from "@/plugins/ads-tracking/ga4-config";
import { browserAdsConfigured } from "@/plugins/ads-tracking/config";
import { AnalyticsPathnameViews } from "@/ui/components/analytics-pathname-views";
import { AnalyticsRuntime } from "@/ui/components/analytics-runtime";
import { GoogleAnalytics } from "@/ui/components/google-analytics";
import { AdPixels } from "@/ui/components/ad-pixels";
import { AnalyticsConsentBanner } from "@/ui/components/analytics-consent-banner";

/**
 * Root-layout mount: merchant tag when a measurement id is set, plus the
 * always-on runtime. Pathname-driven page views sit in Suspense so fallback
 * CMS/catalog params (`pages/[slug]`, …) can still prerender. First-touch and
 * `window.paperAnalytics` stay outside that hole.
 * https://nextjs.org/docs/messages/blocking-prerender-client-hook
 */
export function AnalyticsMount() {
	const measurementId = gaMeasurementId();
	const hasAdvertisingPixels = browserAdsConfigured();

	return (
		<>
			{measurementId ? (
				<GoogleAnalytics measurementId={measurementId} consentMode={analyticsConsentMode()} />
			) : null}
			<AnalyticsRuntime />
			{hasAdvertisingPixels ? <AdPixels /> : null}
			<AnalyticsConsentBanner />
			<Suspense fallback={null}>
				<AnalyticsPathnameViews />
			</Suspense>
		</>
	);
}
