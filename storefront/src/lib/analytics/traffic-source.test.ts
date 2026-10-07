import { describe, expect, it } from "vitest";
import { normalizeTrafficAttribution } from "./traffic-source";

const base = {
	capturedAt: "2026-10-08T00:00:00.000Z",
	landingPath: "/en/us",
};

describe("normalizeTrafficAttribution", () => {
	it("classifies Google click IDs as paid even without UTM tags", () => {
		expect(normalizeTrafficAttribution({ ...base, gclid: "abc" })).toEqual({
			trafficType: "paid",
			sourceGroup: "google",
			referrerHost: null,
		});
	});

	it("classifies paid social from UTM medium and canonicalizes Meta", () => {
		expect(
			normalizeTrafficAttribution({
				...base,
				source: "instagram",
				medium: "paid-social",
				fbclid: "ordinary-facebook-click-id",
			}),
		).toEqual({
			trafficType: "paid",
			sourceGroup: "meta",
			referrerHost: null,
		});
	});

	it("does not treat fbclid alone as proof of paid traffic", () => {
		expect(
			normalizeTrafficAttribution({
				...base,
				fbclid: "abc",
				referrerHost: "facebook.com",
			}),
		).toEqual({
			trafficType: "referral",
			sourceGroup: "meta",
			referrerHost: "facebook.com",
		});
	});

	it("recognizes organic search from referrer when UTM tags are absent", () => {
		expect(normalizeTrafficAttribution({ ...base, referrerHost: "www.google.de" })).toEqual({
			trafficType: "organic",
			sourceGroup: "google",
			referrerHost: "google.de",
		});
	});

	it("classifies an external non-search referrer as referral", () => {
		expect(normalizeTrafficAttribution({ ...base, referrerHost: "reddit.com" })).toEqual({
			trafficType: "referral",
			sourceGroup: "reddit",
			referrerHost: "reddit.com",
		});
	});

	it("falls back to direct when no first-touch evidence exists", () => {
		expect(normalizeTrafficAttribution(base)).toEqual({
			trafficType: "direct",
			sourceGroup: "direct",
			referrerHost: null,
		});
	});
});
