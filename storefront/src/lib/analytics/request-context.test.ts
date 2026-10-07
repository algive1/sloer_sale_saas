import { afterEach, describe, expect, it } from "vitest";
import { readAnalyticsRequestContext } from "./request-context";

function headers(values: Record<string, string>) {
	const normalized = Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
	);
	return { get: (name: string) => normalized[name.toLowerCase()] ?? null };
}

afterEach(() => {
	delete process.env.ANALYTICS_GEO_COUNTRY_HEADER;
	delete process.env.ANALYTICS_GEO_REGION_HEADER;
});

describe("readAnalyticsRequestContext", () => {
	it("reads common CDN geo headers without storing an IP address", () => {
		expect(
			readAnalyticsRequestContext(
				headers({
					"x-vercel-ip-country": "de",
					"x-vercel-ip-country-region": "BY",
					"user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
				}),
			),
		).toEqual({ countryCode: "DE", regionCode: "BY", deviceType: "mobile" });
	});

	it("allows self-hosted deployments to choose trusted geo headers", () => {
		process.env.ANALYTICS_GEO_COUNTRY_HEADER = "x-edge-country";
		process.env.ANALYTICS_GEO_REGION_HEADER = "x-edge-region";
		expect(
			readAnalyticsRequestContext(
				headers({
					"x-edge-country": "JP",
					"x-edge-region": "13",
					"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
				}),
			),
		).toEqual({ countryCode: "JP", regionCode: "13", deviceType: "desktop" });
	});

	it("marks crawlers separately so traffic dashboards can exclude them", () => {
		expect(readAnalyticsRequestContext(headers({ "user-agent": "Googlebot/2.1" })).deviceType).toBe("bot");
	});
});
