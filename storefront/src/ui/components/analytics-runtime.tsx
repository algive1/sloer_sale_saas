"use client";

import { useEffect } from "react";
import { configureClientTrackingPolicy, type ClientTrackingPolicy } from "@/plugins/system/tracking-policy.client";
import {
	applyCampaignFromSnapshot,
	applyConsentToGtag,
	bindPaperAnalyticsApi,
	persistFirstTouch,
} from "@/lib/analytics/browser";

if (typeof window !== "undefined") {
	bindPaperAnalyticsApi();
}

/** Initialize consent before releasing early events under the server's policy. */
export function AnalyticsRuntime({ policy }: { policy: ClientTrackingPolicy }) {
  const { collectAnalytics, trackAds } = policy;
  useEffect(() => {
    configureClientTrackingPolicy({ collectAnalytics, trackAds }, () => {
      bindPaperAnalyticsApi(); persistFirstTouch(); applyConsentToGtag(); applyCampaignFromSnapshot();
    });
  }, [collectAnalytics, trackAds]);
  return null;
}
