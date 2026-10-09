import { afterEach, describe, expect, it, vi } from "vitest";
import {
  channelForCountry,
  channelForExplicitLocale,
  localeForChannel,
  preferredBrowserLocales,
  publishedLocalesForChannel,
  resolveEntryLocalization,
  verifiedCountryFromHeader,
} from "./entry-localization";

afterEach(() => vi.unstubAllEnvs());

function setup(locales = "en,de,fr,nb", pairs = "") {
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", locales);
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_LOCALE", "en");
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS", pairs);
}

describe("root storefront locale negotiation", () => {
  it("respects browser q-values, exclusions and Norwegian Bokmål aliases", () => {
    setup();
    expect(preferredBrowserLocales("en-US;q=0.5, de-DE;q=0.9, fr;q=0, no-NO;q=0.8, *;q=1"))
      .toEqual(["de", "nb", "en"]);
    expect(preferredBrowserLocales("de;q=bad,fr;q=0,en;q=0")).toEqual([]);
  });

  it("preserves valid saved language ahead of Accept-Language", () => {
    setup();
    expect(resolveEntryLocalization({
      defaultLocale: "en", defaultChannel: "eu", allowedChannels: ["eu"],
      savedLocale: "fr", acceptLanguage: "de-DE,de;q=0.8",
    })).toEqual({ locale: "fr", channel: "eu" });
  });

  it("selects browser language on first visit without silently changing currency/channel", () => {
    setup();
    expect(resolveEntryLocalization({
      defaultLocale: "en", defaultChannel: "fashion-us",
      allowedChannels: ["fashion-us", "fashion-eu"], acceptLanguage: "fr-CA,fr;q=0.9,en;q=0.5",
    })).toEqual({ locale: "fr", channel: "fashion-us" });
  });

  it("maps a trusted country ONLY to a market owned by the current brand", () => {
    setup("en,de,fr", "en:fashion-us,de:fashion-eu,fr:fashion-eu,en:jewelry-us");
    const map = "DE:fashion-eu,DE:jewelry-eu,US:fashion-us";
    expect(channelForCountry("DE", map, ["fashion-us", "fashion-eu"])).toBe("fashion-eu");
    expect(channelForCountry("DE", map, ["jewelry-us"])).toBeNull();
    expect(resolveEntryLocalization({
      defaultLocale: "en", defaultChannel: "fashion-us", allowedChannels: ["fashion-us","fashion-eu"],
      acceptLanguage: "de-DE", country: "DE", countryChannelMap: map,
    })).toEqual({ locale: "de", channel: "fashion-eu" });
  });

  it("does not redirect to another brand when a language is unavailable", () => {
    setup("en,fr", "en:fashion-us,fr:jewelry-eu");
    expect(resolveEntryLocalization({
      defaultLocale: "en", defaultChannel: "fashion-us", allowedChannels: ["fashion-us"],
      savedLocale: "fr", acceptLanguage: "fr-FR",
    })).toEqual({ locale: "en", channel: "fashion-us" });
  });

  it("picks only enabled language/channel pairs and handles empty matrices", () => {
    setup("en,de,fr", "en:us,de:eu");
    expect(publishedLocalesForChannel("eu")).toEqual(["de"]);
    expect(localeForChannel("fr", "us", "en")).toBe("en");
    expect(localeForChannel("de", "eu", "en")).toBe("de");
    expect(channelForExplicitLocale("de", "us", ["us","eu"])).toBe("eu");
    expect(channelForExplicitLocale("de", "us", ["us"])).toBeNull();
    expect(resolveEntryLocalization({
      defaultLocale: "en", defaultChannel: "unknown", allowedChannels: ["other"],
    })).toBeNull();
  });

  it("rejects malformed and untrusted geography headers", () => {
    const headers = new Headers({ "x-storefront-visitor-country": "de", "x-forwarded-for": "DE,US" });
    expect(verifiedCountryFromHeader(headers, undefined)).toBeNull();
    expect(verifiedCountryFromHeader(headers, "x-storefront-visitor-country")).toBe("DE");
    expect(verifiedCountryFromHeader(headers, "x-forwarded-for")).toBeNull();
    expect(verifiedCountryFromHeader(headers, "authorization")).toBeNull();
    expect(channelForCountry("DE,US", "DE:eu", ["eu"])).toBeNull();
  });

  it("falls back to enabled language when the saved language is disabled", () => {
    setup("en,de");
    expect(resolveEntryLocalization({
      defaultLocale: "en", defaultChannel: "eu", allowedChannels: ["eu"],
      savedLocale: "pl", acceptLanguage: "ru, de-DE;q=0.7",
    })).toEqual({ locale: "de", channel: "eu" });
  });
});
