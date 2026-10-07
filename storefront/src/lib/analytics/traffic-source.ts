import type { LandingSnapshot } from "@/lib/analytics/landing";

export type TrafficType = "paid" | "organic" | "direct" | "referral" | "other";

export type NormalizedTrafficAttribution = {
	trafficType: TrafficType;
	sourceGroup: string;
	referrerHost: string | null;
};

const PAID_MEDIA = new Set([
	"cpc",
	"ppc",
	"paid",
	"paid_search",
	"paid_social",
	"paidsocial",
	"display",
	"cpm",
	"cpv",
	"cpa",
	"affiliate_paid",
]);

const ORGANIC_MEDIA = new Set(["organic", "organic_search", "organic_social"]);

const OTHER_MEDIA = new Set([
	"email",
	"newsletter",
	"affiliate",
	"referral",
	"sms",
	"push",
]);

export function normalizeTrafficAttribution(
	landing: LandingSnapshot | null,
): NormalizedTrafficAttribution {
	if (!landing) {
		return { trafficType: "direct", sourceGroup: "direct", referrerHost: null };
	}

	const source = normalizeToken(landing.source);
	const medium = normalizeMedium(landing.medium);
	const referrerHost = normalizeHost(landing.referrerHost);
	const clickSource = paidClickSource(landing);

	if (clickSource) {
		return { trafficType: "paid", sourceGroup: clickSource, referrerHost };
	}

	if (PAID_MEDIA.has(medium)) {
		return {
			trafficType: "paid",
			sourceGroup: sourceGroup(source, referrerHost, landing.fbclid ? "meta" : null),
			referrerHost,
		};
	}

	if (ORGANIC_MEDIA.has(medium)) {
		return {
			trafficType: "organic",
			sourceGroup: sourceGroup(source, referrerHost, searchEngineFromHost(referrerHost) ?? "organic"),
			referrerHost,
		};
	}

	const searchEngine = searchEngineFromHost(referrerHost);
	if (searchEngine) {
		return { trafficType: "organic", sourceGroup: searchEngine, referrerHost };
	}

	if (referrerHost) {
		return {
			trafficType: "referral",
			sourceGroup: sourceGroup(source, referrerHost, referrerHost),
			referrerHost,
		};
	}

	if (source || medium) {
		return {
			trafficType: OTHER_MEDIA.has(medium) ? "other" : "other",
			sourceGroup: sourceGroup(source, null, medium || "other"),
			referrerHost: null,
		};
	}

	return { trafficType: "direct", sourceGroup: "direct", referrerHost: null };
}

function paidClickSource(landing: LandingSnapshot): string | null {
	if (landing.gclid || landing.gbraid || landing.wbraid) return "google";
	if (landing.ttclid) return "tiktok";
	if (landing.msclkid) return "microsoft";
	// fbclid is attached to ordinary Facebook/Instagram outbound links too, so it
	// is not sufficient by itself to prove that traffic was paid.
	return null;
}

function sourceGroup(source: string, referrerHost: string | null, fallback: string | null): string {
	return canonicalSource(source) ?? canonicalSource(referrerHost ?? "") ?? fallback ?? "other";
}

function canonicalSource(value: string): string | null {
	const normalized = normalizeToken(value);
	if (!normalized) return null;
	if (matchesAny(normalized, ["google", "googleads", "adwords"])) return "google";
	if (matchesAny(normalized, ["facebook", "fb", "instagram", "meta"])) return "meta";
	if (matchesAny(normalized, ["tiktok", "bytedance"])) return "tiktok";
	if (matchesAny(normalized, ["bing", "microsoft", "msn"])) return "microsoft";
	if (matchesAny(normalized, ["youtube"])) return "youtube";
	if (matchesAny(normalized, ["reddit"])) return "reddit";
	if (matchesAny(normalized, ["pinterest"])) return "pinterest";
	if (matchesAny(normalized, ["linkedin"])) return "linkedin";
	if (matchesAny(normalized, ["x.com", "twitter"])) return "x";
	return normalized.slice(0, 120);
}

function searchEngineFromHost(host: string | null): string | null {
	if (!host) return null;
	if (host === "google.com" || host.startsWith("google.") || host.includes(".google.")) return "google";
	if (host === "bing.com" || host.endsWith(".bing.com")) return "microsoft";
	if (host === "search.yahoo.com" || host.startsWith("search.yahoo.")) return "yahoo";
	if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) return "duckduckgo";
	if (host === "search.brave.com") return "brave";
	if (host === "baidu.com" || host.endsWith(".baidu.com")) return "baidu";
	if (host === "yandex.com" || host.startsWith("yandex.")) return "yandex";
	return null;
}

function normalizeMedium(value: string | undefined): string {
	return normalizeToken(value).replace(/[\s-]+/g, "_");
}

function normalizeToken(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? "";
}

function normalizeHost(value: string | undefined): string | null {
	const host = normalizeToken(value).replace(/^www\./, "");
	return host || null;
}

function matchesAny(value: string, candidates: readonly string[]): boolean {
	return candidates.some((candidate) =>
		value === candidate ||
		value.startsWith(`${candidate}.`) ||
		value.endsWith(`.${candidate}`) ||
		value.includes(`_${candidate}`) ||
		value.includes(`${candidate}_`),
	);
}
