"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { browserAdsConfigured, googleAdsId, metaPixelId, tiktokPixelId } from "@/lib/analytics/ad-platforms";
import {
	ANALYTICS_CONSENT_EVENT,
	adsStorageAllowed,
	type AnalyticsConsentChoice,
} from "@/lib/analytics/consent";
import { readConsentChoice } from "@/lib/analytics/browser";
import { sendAdPageView } from "@/lib/analytics/browser-ads";
import { ga4Enabled } from "@/lib/analytics/ga4";

type AdWindow = Window & {
	fbq?: (...args: unknown[]) => void;
	ttq?: {
		grantConsent?: () => void;
		revokeConsent?: () => void;
	};
};

/**
 * Advertising tags are an explicit-consent lane. They do not mount for implied
 * analytics consent. Purchase events are also delivered server-side where
 * configured; event ids deduplicate the browser/server copies.
 */
export function AdPixels() {
	const [allowed, setAllowed] = useState(false);

	useEffect(() => {
		const sync = () => setAllowed(adsStorageAllowed(readConsentChoice()));
		sync();

		const onConsent = (event: Event) => {
			const choice = (event as CustomEvent<{ choice?: AnalyticsConsentChoice }>).detail?.choice;
			setAllowed(adsStorageAllowed(choice ?? readConsentChoice()));
		};
		window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
		return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
	}, []);

	useEffect(() => {
		const adWindow = window as AdWindow;
		if (allowed) {
			adWindow.fbq?.("consent", "grant");
			adWindow.ttq?.grantConsent?.();
		} else {
			adWindow.fbq?.("consent", "revoke");
			adWindow.ttq?.revokeConsent?.();
		}
	}, [allowed]);

	if (!allowed || !browserAdsConfigured()) return null;

	const metaId = metaPixelId();
	const tiktokId = tiktokPixelId();
	const adsId = googleAdsId();

	return (
		<>
			{metaId ? (
				<Script id="paper-meta-pixel" strategy="afterInteractive" onReady={sendAdPageView}>
					{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaId)});fbq('consent','grant');`}
				</Script>
			) : null}

			{tiktokId ? (
				<Script id="paper-tiktok-pixel" strategy="afterInteractive" onReady={sendAdPageView}>
					{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i='https://analytics.tiktok.com/i18n/pixel/events.js';ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement('script');o.type='text/javascript';o.async=!0;o.src=i+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};ttq.load(${JSON.stringify(tiktokId)});ttq.grantConsent()}(window,document,'ttq');`}
				</Script>
			) : null}

			{adsId && !ga4Enabled() ? (
				<Script src={`https://www.googletagmanager.com/gtag/js?id=${adsId}`} strategy="afterInteractive" />
			) : null}
			{adsId ? (
				<Script id="paper-google-ads-config" strategy="afterInteractive">
					{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});gtag('config',${JSON.stringify(adsId)});`}
				</Script>
			) : null}
		</>
	);
}
