import "server-only";

import { metaPixelId, tiktokPixelId } from "@/lib/analytics/ad-platforms";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { adsStorageAllowed, analyticsStorageAllowed } from "@/lib/analytics/consent";
import {
	ANALYTICS_CONSENT_COOKIE,
	ANALYTICS_SESSION_COOKIE,
	ANALYTICS_LANDING_COOKIE,
	parseConsentChoice,
	parseLandingCookie,
} from "@/lib/analytics/cookies";
import { projectMeta, projectTikTok } from "@/lib/analytics/destinations/ads";
import { projectGa4 } from "@/lib/analytics/destinations/ga4";
import { gaMeasurementId } from "@/lib/analytics/ga4";
import { redactAnalyticsUrl } from "@/lib/analytics/redact-url";

type HeaderReader = {
	get(name: string): string | null;
};

const DELIVERY_TIMEOUT_MS = 2_000;

export async function deliverServerDestinations(
	event: PaperCommerceEvent,
	requestHeaders: HeaderReader,
): Promise<void> {
	const choice = parseConsentChoice(readCookie(requestHeaders, ANALYTICS_CONSENT_COOKIE));
	const jobs: Promise<void>[] = [];

	if (analyticsStorageAllowed(choice)) {
		jobs.push(deliverGa4(event, requestHeaders));
	}
	if (adsStorageAllowed(choice)) {
		jobs.push(deliverMeta(event, requestHeaders), deliverTikTok(event, requestHeaders));
	}

	await Promise.allSettled(jobs);
}

export async function deliverGa4ServerEvent(
	event: PaperCommerceEvent,
	requestHeaders: HeaderReader,
): Promise<void> {
	await deliverGa4(event, requestHeaders);
}

async function deliverGa4(event: PaperCommerceEvent, requestHeaders: HeaderReader): Promise<void> {
	const measurementId = gaMeasurementId();
	const apiSecret = process.env.GA4_API_SECRET?.trim();
	const projected = projectGa4(event);
	if (!measurementId || !apiSecret || !projected) return;

	const clientId =
		gaClientId(readCookie(requestHeaders, "_ga")) ||
		readCookie(requestHeaders, ANALYTICS_SESSION_COOKIE) ||
		event.eventId;
	if (!clientId) return;

	const response = await fetch(
		`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_id: clientId,
				events: [
					{
						name: projected.name,
						params: {
							...projected.params,
							...(event.eventId ? { event_id: event.eventId } : {}),
						},
					},
				],
			}),
			cache: "no-store",
			signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
		},
	);

	if (!response.ok) {
		console.warn("[analytics] GA4 Measurement Protocol failed", response.status);
	}
}

async function deliverMeta(event: PaperCommerceEvent, requestHeaders: HeaderReader): Promise<void> {
	const pixelId = metaPixelId();
	const token = process.env.META_CONVERSIONS_API_TOKEN?.trim();
	const projected = projectMeta(event);
	if (!pixelId || !token || !projected) return;

	const landing = parseLandingCookie(readCookie(requestHeaders, ANALYTICS_LANDING_COOKIE));
	const userData = compact({
		client_ip_address: clientIp(requestHeaders),
		client_user_agent: requestHeaders.get("user-agent"),
		fbp: readCookie(requestHeaders, "_fbp"),
		fbc: readCookie(requestHeaders, "_fbc") || metaFbcFromLanding(landing),
	});
	if (Object.keys(userData).length === 0) return;

	const payload = {
		data: [
			{
				event_name: projected.name,
				event_time: Math.floor(Date.now() / 1000),
				...(event.eventId ? { event_id: event.eventId } : {}),
				action_source: "website",
				...(sourceUrl(requestHeaders) ? { event_source_url: sourceUrl(requestHeaders) } : {}),
				user_data: userData,
				custom_data: projected.params,
			},
		],
	};

	const response = await fetch(
		`https://graph.facebook.com/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
			cache: "no-store",
			signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
		},
	);

	if (!response.ok) {
		console.warn("[analytics] Meta Conversions API failed", response.status);
	}
}

async function deliverTikTok(event: PaperCommerceEvent, requestHeaders: HeaderReader): Promise<void> {
	const pixelId = tiktokPixelId();
	const token = process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN?.trim();
	const projected = projectTikTok(event);
	const url = sourceUrl(requestHeaders);
	if (!pixelId || !token || !projected || !url) return;

	const landing = parseLandingCookie(readCookie(requestHeaders, ANALYTICS_LANDING_COOKIE));
	const user = compact({
		ip: clientIp(requestHeaders),
		user_agent: requestHeaders.get("user-agent"),
		ttclid: landing?.ttclid,
		ttp: readCookie(requestHeaders, "_ttp"),
	});
	const data = compact({
		event: projected.name,
		event_time: Math.floor(Date.now() / 1000),
		event_id: event.eventId,
		...(Object.keys(user).length > 0 ? { user } : {}),
		page: { url },
		properties: projected.params,
	});

	const response = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"Access-Token": token,
		},
		body: JSON.stringify({
			event_source: "web",
			event_source_id: pixelId,
			data: [data],
		}),
		cache: "no-store",
		signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
	});

	if (!response.ok) {
		console.warn("[analytics] TikTok Events API failed", response.status);
	}
}

function sourceUrl(headers: HeaderReader): string | null {
	const raw = headers.get("referer") || process.env.NEXT_PUBLIC_STOREFRONT_URL;
	if (!raw) return null;
	try {
		return redactAnalyticsUrl(raw);
	} catch {
		return null;
	}
}

function clientIp(headers: HeaderReader): string | null {
	const forwarded = headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0]?.trim() || null;
	return headers.get("x-real-ip") || headers.get("cf-connecting-ip");
}

function readCookie(headers: HeaderReader, name: string): string | null {
	const raw = headers.get("cookie");
	if (!raw) return null;
	for (const part of raw.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key !== name) continue;
		const value = rest.join("=");
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}
	return null;
}

function metaFbcFromLanding(landing: ReturnType<typeof parseLandingCookie>): string | null {
	if (!landing?.fbclid) return null;
	const captured = Date.parse(landing.capturedAt);
	const timestamp = Number.isFinite(captured) ? Math.floor(captured) : Date.now();
	return `fb.1.${timestamp}.${landing.fbclid}`;
}

function gaClientId(raw: string | null): string | null {
	if (!raw) return null;
	const parts = raw.split(".");
	if (parts.length < 2) return null;
	return parts.slice(-2).join(".");
}

function compact<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== null && value !== undefined && value !== ""),
	);
}
