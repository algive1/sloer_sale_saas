import "server-only";

import { isIP } from "node:net";
import { serverAdScope, type ServerAdScope, type AdDestination } from "./server-config";
import { claimAdDelivery, finishAdDelivery, type DeliveryResult } from "./delivery-store";
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
import { redactAnalyticsUrl } from "@/lib/analytics/redact-url";

type HeaderReader = {
	get(name: string): string | null;
};

const DELIVERY_TIMEOUT_MS = 2_000;

function safeScope(channel: string, host: string | null, verifiedOrder = false): ServerAdScope | null {
  try { return serverAdScope(channel, host, verifiedOrder); } catch { return null; }
}

async function deliverOnce(event: PaperCommerceEvent, scope: ServerAdScope, destination: AdDestination, send: () => Promise<DeliveryResult>): Promise<void> {
  const configuration = scope[destination];
  const projected = destination === "ga4" ? projectGa4(event) : destination === "meta" ? projectMeta(event) : projectTikTok(event);
  if (!configuration || !projected || !event.eventId) return;
  if (!await claimAdDelivery(scope.siteId, destination, configuration.id, event.name, event.channel, event.eventId)) return;
  let result: DeliveryResult;
  try { result = await send(); }
  catch { result = { status: "unconfirmed", code: "transport_or_receipt_uncertain" }; }
  // If this write fails, the sending claim is retained. Never automatically
  // retry a request that may already have reached a provider.
  await finishAdDelivery(scope.siteId, destination, event.name, event.eventId, result);
}


export async function deliverServerDestinations(
	event: PaperCommerceEvent,
	requestHeaders: HeaderReader,
): Promise<void> {
	const scope = safeScope(event.channel, requestHeaders.get("host"));
	if (!scope) return;
	const choice = parseConsentChoice(readCookie(requestHeaders, ANALYTICS_CONSENT_COOKIE));
	const jobs: Promise<void>[] = [];

	if (analyticsStorageAllowed(choice)) {
		jobs.push(deliverOnce(event, scope, "ga4", () => deliverGa4(event, requestHeaders, scope)));
	}
	if (adsStorageAllowed(choice)) {
		jobs.push(deliverOnce(event, scope, "meta", () => deliverMeta(event, requestHeaders, scope)),
      deliverOnce(event, scope, "tiktok", () => deliverTikTok(event, requestHeaders, scope)));
	}

	await Promise.allSettled(jobs);
}

export async function deliverGa4ServerEvent(
	event: PaperCommerceEvent,
	requestHeaders: HeaderReader,
  verifiedOrderChannel: string,
): Promise<void> {
  if (event.channel !== verifiedOrderChannel) return;
  const scope = safeScope(verifiedOrderChannel, null, true);
  if (!scope) return;
  await deliverOnce(event, scope, "ga4", () => deliverGa4(event, requestHeaders, scope));
}

async function deliverGa4(event: PaperCommerceEvent, requestHeaders: HeaderReader, scope: ServerAdScope): Promise<DeliveryResult> {
	const measurementId = scope.ga4?.id;
	const apiSecret = scope.ga4?.secret;
	const projected = projectGa4(event);
	if (!measurementId || !apiSecret || !projected) return { status: "failed", code: "unconfigured_event" };

	const clientId =
		gaClientId(readCookie(requestHeaders, "_ga")) ||
		readCookie(requestHeaders, ANALYTICS_SESSION_COOKIE) ||
		event.eventId;
	if (!clientId) return { status: "failed", code: "missing_client_id" };

	const response = await fetch(
		`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_id: clientId,
        consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" },
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

	return response.ok ? { status: "transport_accepted", code: "http_2xx_not_processing_proof" }
    : { status: "failed", code: `http_${response.status}` };
}

async function deliverMeta(event: PaperCommerceEvent, requestHeaders: HeaderReader, scope: ServerAdScope): Promise<DeliveryResult> {
	const pixelId = scope.meta?.id;
	const token = scope.meta?.secret;
	const projected = projectMeta(event);
	if (!pixelId || !token || !projected) return { status: "failed", code: "unconfigured_event" };

	const landing = parseLandingCookie(readCookie(requestHeaders, ANALYTICS_LANDING_COOKIE));
	const userData = compact({
		client_ip_address: clientIp(requestHeaders),
		client_user_agent: requestHeaders.get("user-agent"),
		fbp: readCookie(requestHeaders, "_fbp"),
		fbc: readCookie(requestHeaders, "_fbc") || metaFbcFromLanding(landing),
	});
	if (Object.keys(userData).length === 0) return { status: "failed", code: "missing_matching_data" };

	const payload = {
		data: [
			{
				event_name: projected.name,
				event_time: Math.floor(Date.now() / 1000),
				...(event.eventId ? { event_id: event.eventId } : {}),
				action_source: "website",
				...(sourceUrl(requestHeaders, scope) ? { event_source_url: sourceUrl(requestHeaders, scope) } : {}),
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

	if (!response.ok) return { status: "failed", code: `http_${response.status}` };
  const result = await response.json() as { events_received?: number; error?: unknown };
  return !result.error && Number(result.events_received) > 0 ? { status: "provider_accepted", code: "events_received" }
    : { status: "failed", code: "meta_rejected_or_missing_receipt" };
}

async function deliverTikTok(event: PaperCommerceEvent, requestHeaders: HeaderReader, scope: ServerAdScope): Promise<DeliveryResult> {
	const pixelId = scope.tiktok?.id;
	const token = scope.tiktok?.secret;
	const projected = projectTikTok(event);
	const url = sourceUrl(requestHeaders, scope);
	if (!pixelId || !token || !projected || !url) return { status: "failed", code: "unconfigured_event" };

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

	if (!response.ok) return { status: "failed", code: `http_${response.status}` };
  const result = await response.json() as { code?: number };
  return result.code === 0 ? { status: "provider_accepted", code: "code_0" }
    : { status: "failed", code: "tiktok_rejected_or_missing_receipt" };
}

function sourceUrl(headers: HeaderReader, scope: ServerAdScope): string | null {
	let raw = headers.get("referer") || scope.origin;
  if (scope.domains.length) {
    try { const url = new URL(raw); if (url.protocol !== "https:" || !scope.domains.includes(url.hostname)) raw = scope.origin; }
    catch { raw = scope.origin; }
  }
	if (!raw) return null;
	try {
		return redactAnalyticsUrl(raw);
	} catch {
		return null;
	}
}

function clientIp(headers: HeaderReader): string | null {
  const name = process.env.ANALYTICS_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!name || !["x-real-ip", "cf-connecting-ip", "x-storefront-client-ip"].includes(name)) return null;
  const value = headers.get(name)?.trim();
  return value && isIP(value) ? value : null;
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
