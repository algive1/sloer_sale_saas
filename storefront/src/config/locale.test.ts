import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getGraphqlLanguageCode,
	getStorefrontLocaleSlugs,
	isLocaleSlug,
	isStorefrontLocaleSlug,
} from "./locale";

describe("isStorefrontLocaleSlug", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("accepts slugs in NEXT_PUBLIC_STOREFRONT_LOCALES", () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", "en,pl,ja");
		expect(isStorefrontLocaleSlug("en")).toBe(true);
		expect(isStorefrontLocaleSlug("pl")).toBe(true);
		expect(isStorefrontLocaleSlug("ja")).toBe(true);
	});

	it("rejects defined locales outside the allowlist", () => {
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", "en");
		expect(isLocaleSlug("de")).toBe(true);
		expect(isStorefrontLocaleSlug("de")).toBe(false);
	});

	it("defines all core-market locales plus the existing compatibility locales", () => {
		for (const locale of ["en", "de", "fr", "nl", "da", "sv", "es", "it", "pl", "pt", "cs", "ja", "fi", "nb", "ko"]) {
			expect(isLocaleSlug(locale)).toBe(true);
		}
	});

	it("defaults to a single locale when NEXT_PUBLIC_STOREFRONT_LOCALES is unset", () => {
		expect(getStorefrontLocaleSlugs()).toEqual(["en"]);
		expect(isStorefrontLocaleSlug("en")).toBe(true);
		expect(isStorefrontLocaleSlug("pl")).toBe(false);
	});
});

describe("getGraphqlLanguageCode", () => {
	it("maps URL slugs to Saleor base language codes (not regional variants)", () => {
		expect(getGraphqlLanguageCode("en")).toBe("EN");
		expect(getGraphqlLanguageCode("de")).toBe("DE");
		expect(getGraphqlLanguageCode("fr")).toBe("FR");
		expect(getGraphqlLanguageCode("nl")).toBe("NL");
		expect(getGraphqlLanguageCode("da")).toBe("DA");
		expect(getGraphqlLanguageCode("sv")).toBe("SV");
		expect(getGraphqlLanguageCode("es")).toBe("ES");
		expect(getGraphqlLanguageCode("it")).toBe("IT");
		expect(getGraphqlLanguageCode("pl")).toBe("PL");
		expect(getGraphqlLanguageCode("pt")).toBe("PT");
		expect(getGraphqlLanguageCode("cs")).toBe("CS");
		expect(getGraphqlLanguageCode("ja")).toBe("JA");
		expect(getGraphqlLanguageCode("fi")).toBe("FI");
		expect(getGraphqlLanguageCode("nb")).toBe("NB");
		expect(getGraphqlLanguageCode("ko")).toBe("KO");
	});
});
