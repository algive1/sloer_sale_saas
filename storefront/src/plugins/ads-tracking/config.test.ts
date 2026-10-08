import { describe, expect, it } from "vitest";
import {
	browserAdsConfigured,
	googleAdsId,
	googleAdsPurchaseLabel,
	metaPixelId,
	tiktokPixelId,
} from "./config";

describe("ad platform configuration", () => {
	it("validates supported public ids", () => {
		expect(metaPixelId("123456789012345")).toBe("123456789012345");
		expect(metaPixelId("pixel-123")).toBeNull();
		expect(tiktokPixelId("CABCDEF123456789")).toBe("CABCDEF123456789");
		expect(googleAdsId("AW-123456789")).toBe("AW-123456789");
		expect(googleAdsId("G-ABC123")).toBeNull();
		expect(googleAdsPurchaseLabel("abc_DEF-123")).toBe("abc_DEF-123");
	});

	it("is off when no public ad id is configured", () => {
		expect(browserAdsConfigured()).toBe(false);
	});
});
