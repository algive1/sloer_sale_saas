import { getBrowserLocale, shouldAutoDetectLocale } from "./localeDetection";

const supportedLocales = ["en", "ja", "zh-Hans", "zh-Hant", "pt", "pt-BR", "nb"];

describe("getBrowserLocale", () => {
  it("matches exact and regional browser languages case-insensitively", () => {
    expect(getBrowserLocale(["JA-jp"], supportedLocales)).toBe("ja");
    expect(getBrowserLocale(["pt-br"], supportedLocales)).toBe("pt-BR");
  });

  it("selects the correct Chinese script from browser language tags", () => {
    expect(getBrowserLocale(["zh-CN"], supportedLocales)).toBe("zh-Hans");
    expect(getBrowserLocale(["zh-HK"], supportedLocales)).toBe("zh-Hant");
    expect(getBrowserLocale(["zh"], supportedLocales)).toBe("zh-Hans");
  });

  it("uses the first supported language from the browser preference list", () => {
    expect(getBrowserLocale(["fr-CA", "de", "ja-JP"], supportedLocales)).toBe("ja");
  });

  it("maps Norwegian browser tags to the supported Bokmål locale", () => {
    expect(getBrowserLocale(["no-NO"], supportedLocales)).toBe("nb");
  });

  it("returns undefined when no browser language is supported", () => {
    expect(getBrowserLocale(["fr-CA", "de-DE"], supportedLocales)).toBeUndefined();
  });

  it("migrates a saved default to automatic mode but preserves explicit choices", () => {
    expect(shouldAutoDetectLocale(null, "zh-Hans", "zh-Hans")).toBe(true);
    expect(shouldAutoDetectLocale(null, "fr", "zh-Hans")).toBe(false);
    expect(shouldAutoDetectLocale("manual", "zh-Hans", "zh-Hans")).toBe(false);
    expect(shouldAutoDetectLocale("auto", "fr", "zh-Hans")).toBe(true);
  });
});
