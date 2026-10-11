import { Suspense } from "react";
import { io } from "next/cache";
import { pluginPauseReason } from "@/plugins/system/runtime.server";
import { webAnalyticsEnabled } from "@/lib/analytics/web-analytics";
import { WebAnalytics } from "@/ui/components/web-analytics";
import { analyticsConsentMode } from "@/lib/analytics/consent";
import { gaMeasurementId } from "@/plugins/ads-tracking/ga4-config";
import { brandSitesConfigured } from "@/config/brand-sites";
import { browserAdsConfigured } from "@/plugins/ads-tracking/config";
import { AnalyticsPathnameViews } from "@/ui/components/analytics-pathname-views";
import { AnalyticsRuntime } from "@/ui/components/analytics-runtime";
import { GoogleAnalytics } from "@/ui/components/google-analytics";
import { AdPixels } from "@/ui/components/ad-pixels";
import { AnalyticsConsentBanner } from "@/ui/components/analytics-consent-banner";

/** Request-time policy remains outside the cached storefront/checkout shell. */
export function AnalyticsMount() {
  return <Suspense fallback={null}><TrackingSlot /></Suspense>;
}
async function TrackingSlot() {
  await io();
  const policy = { collectAnalytics: !pluginPauseReason("analytics"), trackAds: !pluginPauseReason("ads-tracking") };
	const measurementId = !policy.trackAds || brandSitesConfigured() ? null : gaMeasurementId();
	const hasAdvertisingPixels = policy.trackAds && !brandSitesConfigured() && browserAdsConfigured();

	return (
		<>
			{measurementId ? (
				<GoogleAnalytics measurementId={measurementId} consentMode={analyticsConsentMode()} />
			) : null}
			<AnalyticsRuntime policy={policy} />
            {policy.collectAnalytics && webAnalyticsEnabled() ? <WebAnalytics /> : null}
			{hasAdvertisingPixels ? <AdPixels /> : null}
			{policy.collectAnalytics || policy.trackAds ? <AnalyticsConsentBanner /> : null}
			<Suspense fallback={null}>
				<AnalyticsPathnameViews />
			</Suspense>
		</>
	);
}
