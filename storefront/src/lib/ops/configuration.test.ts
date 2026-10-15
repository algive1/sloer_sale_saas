import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { OPS_CONFIGURATION, configurationForPath, configurationForViewer } from "./configuration";
import { SYSTEM_PLUGINS } from "@/plugins/system/registry";
import { opsNavigationForRole } from "./navigation";
import type { OpsViewer } from "./authorization";
import { createOpsI18n } from "./i18n";

const staff: OpsViewer = {
	username: "staff@example.com",
	role: "platform_admin",
	siteIds: [],
	authSource: "saleor",
	permissions: ["MANAGE_TRANSLATIONS"],
	restrictedAccessToChannels: false,
};

describe("Ops configuration destinations", () => {
	it("translates every configuration title, action and instruction in English", () => {
		const { t } = createOpsI18n("en");
		for (const section of OPS_CONFIGURATION) {
			for (const text of [section.title, section.action, section.online, section.deployment]) {
				expect(t(text), text).not.toMatch(/\p{Script=Han}/u);
			}
		}
	});
	it("covers every registered feature with a real destination, documented variables and existing docs", () => {
		const env = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
		const paths = opsNavigationForRole("platform_admin").flatMap((group) =>
			group.children.map((item) => item.href),
		);
		expect(OPS_CONFIGURATION.map((section) => section.id).sort()).toEqual(Object.keys(SYSTEM_PLUGINS).sort());
		for (const section of OPS_CONFIGURATION) {
			expect(paths).toContain(section.href);
			for (const variable of section.variables) expect(env, variable).toContain(variable);
			for (const doc of section.docs)
				expect(existsSync(new URL(`../../../../${doc}`, import.meta.url)), doc).toBe(true);
		}
	});

	it("filters guides and their forms with the existing destination permissions", () => {
		expect(configurationForViewer(staff).map((section) => section.id)).toEqual(["ai-translations"]);
		expect(
			configurationForViewer({ ...staff, permissions: ["MANAGE_ORDERS"] }).map((section) => section.id),
		).toEqual(["analytics", "payment-reminders"]);
		expect(
			configurationForViewer({ ...staff, permissions: ["MANAGE_USERS"] }).map((section) => section.id),
		).toEqual(["customer-support"]);
		expect(configurationForViewer({ ...staff, role: "brand_analyst", siteIds: ["fashion"] })).toEqual([]);
		expect(configurationForViewer({ ...staff, restrictedAccessToChannels: true })).toEqual([]);
		expect(configurationForViewer({ username: "owner", role: "platform_admin", siteIds: [] })).toHaveLength(
			7,
		);
	});

	it("links feature pages to their specific guide, keeping specialized analytics routes distinct", () => {
		expect(configurationForPath("/ops/analytics/reminders")?.id).toBe("payment-reminders");
		expect(configurationForPath("/ops/analytics/destinations")?.id).toBe("ads-tracking");
		expect(configurationForPath("/ops/analytics/products")?.id).toBe("analytics");
		expect(configurationForPath("/ops/support")?.id).toBe("customer-support");
		expect(configurationForPath("/ops/support/settings")?.id).toBe("customer-support");
		expect(configurationForPath("/ops/themes")?.id).toBe("theme-builder");
		expect(configurationForPath("/ops/settings")).toBeUndefined();
		expect(configurationForPath("/ops/analytics-other")).toBeUndefined();
	});
});
