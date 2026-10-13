import { describe, expect, it } from "vitest";
import { resolveOpsLocale, resolveOpsUiLocale } from "./locale";

describe("resolveOpsLocale", () => {
	it.each([
		["zh", "zh-Hans"],
		["zh-CN", "zh-Hans"],
		["zh-SG", "zh-Hans"],
		["zh-TW", "zh-Hant"],
		["zh-HK", "zh-Hant"],
		["zh-Hant", "zh-Hant"],
		["en-US", "en-US"],
	])("preserves the browser locale and maps Chinese scripts (%s)", (input, expected) => {
		expect(resolveOpsLocale(input)).toBe(expected);
	});

	it("uses the first browser language when the embed does not provide a locale", () => {
		expect(resolveOpsLocale(null, ["zh-TW", "en-US"])).toBe("zh-Hant");
		expect(resolveOpsLocale(undefined, [])).toBe("en");
	});
});

describe("resolveOpsUiLocale", () => {
	it.each(["zh-CN", "zh-Hans", "zh-Hant", "zh-TW"])(
		"uses Chinese for %s independently of shopper languages",
		(locale) => {
			expect(resolveOpsUiLocale(locale, "en-US")).toBe("zh");
		},
	);
	it("gives Dashboard choices priority over the browser", () => {
		expect(resolveOpsUiLocale("en", "zh-CN, en;q=0.9")).toBe("en");
	});
	it("honors browser preference weights and excludes disabled languages", () => {
		expect(resolveOpsUiLocale(null, "en;q=0.2,zh-CN;q=0.9")).toBe("zh");
		expect(resolveOpsUiLocale(null, "zh;q=0,en;q=1")).toBe("en");
		expect(resolveOpsUiLocale(null, "de,zh;q=0.5")).toBe("en");
		expect(resolveOpsUiLocale(null, "zh;q=invalid")).toBe("en");
	});
});
