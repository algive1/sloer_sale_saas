import { expect, it } from "vitest";
import { parseWhatsAppBindings, whatsappLink } from "./whatsapp-config";

it("allows explicitly selected brands without assigning any fallback number", () => {
	expect(parseWhatsAppBindings(undefined, ["fashion", "jewelry"])).toEqual([]);
	expect(parseWhatsAppBindings("[]", ["fashion"])).toEqual([]);
	expect(
		parseWhatsAppBindings('[{"siteId":"fashion","phone":"12025550101"}]', ["fashion", "jewelry"]),
	).toEqual([{ siteId: "fashion", phone: "12025550101" }]);
});
it("rejects cross-brand, shared or duplicate mappings and accidentally included credentials", () => {
	for (const rows of [
		[{ siteId: "foreign", phone: "12025550101" }],
		[
			{ siteId: "fashion", phone: "12025550101" },
			{ siteId: "jewelry", phone: "12025550101" },
		],
		[
			{ siteId: "fashion", phone: "12025550101" },
			{ siteId: "fashion", phone: "12025550102" },
		],
		[{ siteId: "fashion", phone: "12025550101", accessToken: "private" }],
		[null],
		{},
	])
		expect(() => parseWhatsAppBindings(JSON.stringify(rows), ["fashion", "jewelry"])).toThrow();
});
it("accepts only international digits and rejects URL/format/control-character injection", () => {
	for (const phone of [
		"+12025550101",
		"0012025550101",
		"1202 5550101",
		"https://evil.test",
		"12025550101?x=1",
		"12025550101\n",
		"1234567",
		"1".repeat(16),
	]) {
		expect(() =>
			parseWhatsAppBindings(JSON.stringify([{ siteId: "fashion", phone }]), ["fashion"]),
		).toThrow();
		expect(() => whatsappLink({ siteId: "fashion", phone }, "en")).toThrow();
	}
});
it("creates only the intended host/number and a static localized greeting, never caller-provided message content", () => {
	const binding = { siteId: "fashion", phone: "12025550101" };
	const french = new URL(whatsappLink(binding, "fr"));
	expect(french.origin).toBe("https://wa.me");
	expect(french.pathname).toBe("/12025550101");
	expect(french.searchParams.get("text")).toContain("Bonjour");
	for (const locale of ["unknown?orderToken=private", "constructor", "__proto__"]) {
		expect(new URL(whatsappLink(binding, locale)).searchParams.get("text")).toBe("Hello, I would like help with your store.");
	}
});
