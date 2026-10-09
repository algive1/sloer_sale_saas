import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLocaleHreflangAlternates } from "./hreflang";

describe("buildLocaleHreflangAlternates", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("builds language-only hreflang keys when locale×channel pairs are unset", () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", "en,pl");
		vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHANNEL", "default-channel");
		vi.stubEnv("STOREFRONT_CHANNELS", "default-channel");

		expect(buildLocaleHreflangAlternates("default-channel", "/products/hoodie")).toEqual({
			en: "/en/default-channel/products/hoodie",
			pl: "/pl/default-channel/products/hoodie",
			"x-default": "/en/default-channel/products/hoodie",
		});
	});

	it("uses paired channels and region-aware keys when LOCALE_CHANNELS is configured", () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", "en,pl,ja");
		vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHANNEL", "default-channel");
		vi.stubEnv("STOREFRONT_CHANNELS", "default-channel,channel-pln,japan");
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS", "en:default-channel,pl:channel-pln,ja:japan");

		expect(buildLocaleHreflangAlternates("default-channel", "/products/hoodie")).toEqual({
			"en-US": "/en/default-channel/products/hoodie",
			"pl-PL": "/pl/channel-pln/products/hoodie",
			"ja-JP": "/ja/japan/products/hoodie",
			"x-default": "/en/default-channel/products/hoodie",
		});
	});

	it("uses per-locale path suffixes for translated catalog slugs", () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", "en,pl");
		vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "en");
		vi.stubEnv("NEXT_PUBLIC_DEFAULT_CHANNEL", "default-channel");
		vi.stubEnv("STOREFRONT_CHANNELS", "default-channel");

		expect(
			buildLocaleHreflangAlternates("default-channel", {
				en: "/products/hoodie",
				pl: "/products/bluza",
			}),
		).toEqual({
			en: "/en/default-channel/products/hoodie",
			pl: "/pl/default-channel/products/bluza",
			"x-default": "/en/default-channel/products/hoodie",
		});
	});
	it("keeps all localized alternates within the owning brand, including x-default", () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", "en,de,fr");
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS", "en:fashion-us,de:fashion-eu,en:fashion-eu,en:jewelry-us,fr:jewelry-us");
		vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([
			{ id: "fashion", name: "Fashion", domains: ["fashion.example.test"],
				channels: ["fashion-us", "fashion-eu"], defaultChannel: "fashion-us", defaultLocale: "en" },
			{ id: "jewelry", name: "Jewelry", domains: ["jewelry.example.test"],
				channels: ["jewelry-us"], defaultChannel: "jewelry-us", defaultLocale: "en" },
		]));

		const fashion = buildLocaleHreflangAlternates("fashion-eu", "/products/hoodie");
		expect(fashion["de-DE"]).toBe("https://fashion.example.test/de/fashion-eu/products/hoodie");
		expect(fashion["en-US"]).toBe("https://fashion.example.test/en/fashion-eu/products/hoodie");
		expect(fashion["x-default"]).toBe("https://fashion.example.test/en/fashion-us/products/hoodie");
		expect(Object.values(fashion).join(" ")).not.toContain("jewelry");
		expect(fashion["fr-FR"]).toBeUndefined();

		const jewelry = buildLocaleHreflangAlternates("jewelry-us", "/products/ring");
		expect(jewelry["fr-FR"]).toBe("https://jewelry.example.test/fr/jewelry-us/products/ring");
		expect(jewelry["x-default"]).toBe("https://jewelry.example.test/en/jewelry-us/products/ring");
		expect(Object.values(jewelry).join(" ")).not.toContain("fashion");
		expect(jewelry["de-DE"]).toBeUndefined();
	});

});
