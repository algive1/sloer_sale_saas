import { redactAnalyticsUrl } from "@/lib/analytics/redact-url";

export type LandingSnapshot = {
	capturedAt: string;
	landingPath: string;
	source?: string;
	medium?: string;
	campaign?: string;
	term?: string;
	content?: string;
	gclid?: string;
	gbraid?: string;
	wbraid?: string;
	fbclid?: string;
	ttclid?: string;
	msclkid?: string;
};

const UTM_FIELDS = [
	["utm_source", "source"],
	["utm_medium", "medium"],
	["utm_campaign", "campaign"],
	["utm_term", "term"],
	["utm_content", "content"],
] as const;

const CLICK_FIELDS = [
	["gclid", "gclid"],
	["gbraid", "gbraid"],
	["wbraid", "wbraid"],
	["fbclid", "fbclid"],
	["ttclid", "ttclid"],
	["msclkid", "msclkid"],
] as const;

const CLICK_ID_PARAMS = new Set([
	...CLICK_FIELDS.map(([param]) => param),
	"twclid",
	"li_fat_id",
	"mc_eid",
]);

const MAX_UTM_CHARS = 200;
const MAX_CLICK_ID_CHARS = 512;
const MAX_LANDING_PATH_CHARS = 400;

export function captureLandingSnapshot(href: string, now = new Date()): LandingSnapshot {
	const snapshot: LandingSnapshot = {
		capturedAt: now.toISOString(),
		landingPath: landingPathFromHref(href),
	};

	try {
		const url = new URL(href);
		for (const [param, field] of UTM_FIELDS) {
			const value = sanitizeToken(url.searchParams.get(param), MAX_UTM_CHARS);
			if (value) snapshot[field] = value;
		}
		for (const [param, field] of CLICK_FIELDS) {
			const value = sanitizeToken(url.searchParams.get(param), MAX_CLICK_ID_CHARS);
			if (value) snapshot[field] = value;
		}
	} catch {
		// landingPath already failed closed
	}
	return snapshot;
}

export function serializeLandingSnapshot(snapshot: LandingSnapshot): string {
	return JSON.stringify(snapshot);
}

export function parseLandingSnapshot(raw: string): LandingSnapshot | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const record = parsed as Record<string, unknown>;
	if (typeof record.capturedAt !== "string" || typeof record.landingPath !== "string") return null;
	if (!record.capturedAt || !isSafeLandingPath(record.landingPath)) return null;

	const snapshot: LandingSnapshot = {
		capturedAt: record.capturedAt,
		landingPath: record.landingPath,
	};
	for (const [, field] of UTM_FIELDS) {
		const value = sanitizeToken(typeof record[field] === "string" ? record[field] : null, MAX_UTM_CHARS);
		if (value) snapshot[field] = value;
	}
	for (const [, field] of CLICK_FIELDS) {
		const value = sanitizeToken(
			typeof record[field] === "string" ? record[field] : null,
			MAX_CLICK_ID_CHARS,
		);
		if (value) snapshot[field] = value;
	}
	return snapshot;
}

export function landingPathFromHref(href: string): string {
	const redacted = redactAnalyticsUrl(href);
	try {
		const url = new URL(redacted);
		for (const name of [...url.searchParams.keys()]) {
			const lower = name.toLowerCase();
			if (lower.startsWith("utm_") || CLICK_ID_PARAMS.has(lower)) url.searchParams.delete(name);
		}
		return clipLandingPath(`${url.pathname}${url.search}`);
	} catch {
		const path = redacted.split(/[?#]/, 1)[0] ?? "";
		return isSafeLandingPath(path) ? clipLandingPath(path) : "/";
	}
}

function isSafeLandingPath(path: string): boolean {
	return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

function clipLandingPath(path: string): string {
	if (path.length <= MAX_LANDING_PATH_CHARS) return path;
	const queryAt = path.indexOf("?");
	const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
	return pathname.length <= MAX_LANDING_PATH_CHARS ? pathname : pathname.slice(0, MAX_LANDING_PATH_CHARS);
}

function hasControlChars(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code < 32 || code === 127) return true;
	}
	return false;
}

function sanitizeToken(value: string | null, maxChars: number): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed || hasControlChars(trimmed)) return undefined;
	return trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
}
