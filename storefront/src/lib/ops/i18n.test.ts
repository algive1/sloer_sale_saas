import { describe, expect, it } from "vitest";
import en from "../../../messages/ops/en.json";
import zh from "../../../messages/ops/zh.json";
import { createOpsI18n } from "./i18n";

describe("Ops message catalogs", () => {
	it("has matching English and Chinese keys and compiles every message", () => {
		expect(Object.keys(en)).toEqual(Object.keys(zh));
		for (const locale of ["en", "zh"] as const) {
			const { t } = createOpsI18n(locale);
			for (const [key, source] of Object.entries(zh)) {
				const values = Object.fromEntries(
					[...source.matchAll(/\{(\w+)\}/g)].map((match) => [match[1], "sample"]),
				);
				const rendered = t(source, values);
				expect(rendered, `${locale}:${key}`).toBeTruthy();
				if (locale === "en") expect(rendered, key).not.toMatch(/\p{Script=Han}/u);
			}
		}
	});
	it("translates known interpolated service diagnostics without changing identifiers", () => {
		expect(createOpsI18n("en").t("规格 SKU-中-1 缺少有效重量")).toBe("Variant SKU-中-1 lacks a valid weight");
		expect(createOpsI18n("en").t("us · 商品、库存与币种")).toBe("us · Products, stock and currency");
	});
	it("leaves provider errors and merchant data untouched when no message is declared", () => {
		const source = "商家自定义产品名 / provider_error_123";
		expect(createOpsI18n("en").t(source)).toBe(source);
	});
});
