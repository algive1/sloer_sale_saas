import { describe, expect, it } from "vitest";
import { LOCALE_DEFINITIONS, type LocaleSlug } from "./locale";

const messageLoaders: Record<LocaleSlug, () => Promise<{ default: Record<string, unknown> }>> = {
	en: () => import("../../messages/en.json"),
	de: () => import("../../messages/de.json"),
	fr: () => import("../../messages/fr.json"),
	nl: () => import("../../messages/nl.json"),
	da: () => import("../../messages/da.json"),
	sv: () => import("../../messages/sv.json"),
	es: () => import("../../messages/es.json"),
	it: () => import("../../messages/it.json"),
	pl: () => import("../../messages/pl.json"),
	pt: () => import("../../messages/pt.json"),
	cs: () => import("../../messages/cs.json"),
	ja: () => import("../../messages/ja.json"),
	fi: () => import("../../messages/fi.json"),
	nb: () => import("../../messages/nb.json"),
	ko: () => import("../../messages/ko.json"),
};

describe("locale message catalogs", () => {
	it("has a loadable message file for every locale definition", async () => {
		expect(Object.keys(messageLoaders).sort()).toEqual(Object.keys(LOCALE_DEFINITIONS).sort());

		for (const locale of Object.keys(LOCALE_DEFINITIONS) as LocaleSlug[]) {
			const messagesModule = await messageLoaders[locale]();
			expect(messagesModule.default).toBeTruthy();
			expect(messagesModule.default.nav).toBeTruthy();
			expect(messagesModule.default.checkout).toBeTruthy();
		}
	});
});
