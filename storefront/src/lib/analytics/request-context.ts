export type AnalyticsRequestContext = {
	countryCode: string | null;
	regionCode: string | null;
	deviceType: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
};

type HeaderReader = { get(name: string): string | null };

const COUNTRY_HEADERS = [
	"x-vercel-ip-country",
	"cf-ipcountry",
	"cloudfront-viewer-country",
] as const;

const REGION_HEADERS = [
	"x-vercel-ip-country-region",
	"cloudfront-viewer-country-region",
] as const;

export function readAnalyticsRequestContext(headers: HeaderReader): AnalyticsRequestContext {
	return {
		countryCode: readCountryCode(headers),
		regionCode: readRegionCode(headers),
		deviceType: readDeviceType(headers),
	};
}

function readCountryCode(headers: HeaderReader): string | null {
	const value = readFirstHeader(headers, process.env.ANALYTICS_GEO_COUNTRY_HEADER, COUNTRY_HEADERS);
	if (!value) return null;
	const code = value.trim().toUpperCase();
	return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null;
}

function readRegionCode(headers: HeaderReader): string | null {
	const value = readFirstHeader(headers, process.env.ANALYTICS_GEO_REGION_HEADER, REGION_HEADERS);
	if (!value) return null;
	const code = value.trim();
	if (!code || code.length > 80 || hasControlChars(code)) return null;
	return code;
}

function readDeviceType(headers: HeaderReader): AnalyticsRequestContext["deviceType"] {
	const userAgent = headers.get("user-agent") ?? "";
	if (/bot|crawler|spider|slurp|headless/i.test(userAgent)) return "bot";

	const mobileHint = headers.get("sec-ch-ua-mobile");
	if (mobileHint === "?1") return "mobile";

	if (/ipad|tablet|kindle|silk|android(?!.*mobile)/i.test(userAgent)) return "tablet";
	if (/mobi|iphone|ipod|android|iemobile|opera mini/i.test(userAgent)) return "mobile";
	return "desktop";
}

function readFirstHeader(
	headers: HeaderReader,
	configuredHeader: string | undefined,
	fallbackHeaders: readonly string[],
): string | null {
	const configured = configuredHeader?.trim().toLowerCase();
	if (configured) {
		const value = headers.get(configured);
		if (value) return value;
	}
	for (const name of fallbackHeaders) {
		const value = headers.get(name);
		if (value) return value;
	}
	return null;
}

function hasControlChars(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code < 32 || code === 127) return true;
	}
	return false;
}
