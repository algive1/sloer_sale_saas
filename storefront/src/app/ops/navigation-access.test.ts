import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OpsViewer } from "@/lib/ops/authorization";
import { createOpsI18n } from "@/lib/ops/i18n";

const state = vi.hoisted(() => ({ viewer: null as OpsViewer | null }));
vi.mock("@/lib/ops/current-viewer.server", () => ({ currentOpsViewer: async () => state.viewer }));
vi.mock("@/lib/ops/i18n.server", () => ({ getOpsI18n: async () => ({ t: (text: string) => text }) }));
vi.mock("@/config/brand-sites", () => ({
	getBrandSites: () => [
		{ id: "fashion", name: "Fashion", domains: [], channels: ["us"], defaultChannel: "us" },
	],
	siteIdForChannel: () => "fashion",
}));
vi.mock("@/config/channels", () => ({ getStaticStorefrontChannelSlugs: () => ["us"] }));
vi.mock("@/config/locale", () => ({ getStorefrontLocaleSlugs: () => ["en"] }));
vi.mock("@/config/locale-channel", () => ({ getConfiguredLocaleChannelPairs: () => null }));
vi.mock("@/plugins/customer-support/agent-workbench.server", () => ({ configuredAgentBrands: () => [] }));
vi.mock("@/lib/ops/i18n.client", () => ({ useOpsI18n: () => ({ t: (text: string) => text, locale: "en" }) }));

import BrandSitesPage from "./sites/page";
import SupportPage from "./support/page";
import OpsSettingsPage from "./settings/page";

async function renderContent(boundary: ReactElement<{ children: ReactElement }>): Promise<string> {
	const content = boundary.props.children;
	const component = content.type as () => Promise<ReactNode>;
	return renderToStaticMarkup(createElement("div", null, await component()));
}

describe("Ops destination permissions", () => {
	it("uses the existing translated catalog action in both Ops locales", () => {
		expect(createOpsI18n("en").t("检查商品发布资料 →")).toBe("Check product publication data →");
		expect(createOpsI18n("zh").t("检查商品发布资料 →")).toBe("检查商品发布资料 →");
	});
	beforeEach(() => {
		state.viewer = {
			username: "staff@example.com",
			role: "platform_admin",
			siteIds: [],
			authSource: "saleor",
			permissions: [],
			restrictedAccessToChannels: false,
		};
	});

	it("gives product staff a reachable catalog entry without privileged brand links", async () => {
		state.viewer = { ...state.viewer!, permissions: ["MANAGE_PRODUCTS"] };
		const html = await renderContent(await BrandSitesPage());
		expect(html).toContain('href="/ops/sites/fashion/catalog"');
		expect(html).not.toContain('href="/ops/sites/fashion/readiness"');
		expect(html).not.toContain('href="/ops/sites/fashion"');
		expect(html).not.toContain('href="/ops/themes');
		expect(html).not.toContain('href="/ops/analytics"');
	});

	it("shows only permitted brand destinations for orders staff", async () => {
		state.viewer = { ...state.viewer!, permissions: ["MANAGE_ORDERS"] };
		const html = await renderContent(await BrandSitesPage());
		expect(html).toContain('href="/ops/sites/fashion"');
		expect(html).not.toContain('href="/ops/sites/fashion/readiness"');
		expect(html).not.toContain('href="/ops/sites/fashion/catalog"');
		expect(html).not.toContain('href="/ops/themes');
	});

	it("keeps settings and Basic administrator destinations", async () => {
		state.viewer = { ...state.viewer!, permissions: ["MANAGE_SETTINGS"] };
		const settingsHtml = await renderContent(await BrandSitesPage());
		expect(settingsHtml).toContain('href="/ops/sites/fashion/readiness"');
		expect(settingsHtml).toContain('href="/ops/themes');
		expect(settingsHtml).not.toContain('href="/ops/sites/fashion/catalog"');
		state.viewer = { username: "owner", role: "platform_admin", siteIds: [] };
		const basicHtml = await renderContent(await BrandSitesPage());
		expect(basicHtml).toContain('href="/ops/sites/fashion/catalog"');
		expect(basicHtml).toContain('href="/ops/sites/fashion/readiness"');
	});

	it("hides support settings from orders-only staff behind the request boundary", async () => {
		state.viewer = { ...state.viewer!, permissions: ["MANAGE_ORDERS"] };
		expect(await renderContent(SupportPage())).not.toContain('href="/ops/support/settings"');
		state.viewer = { ...state.viewer, permissions: ["MANAGE_USERS"] };
		expect(await renderContent(SupportPage())).toContain('href="/ops/support/settings"');
	});

	it("renders only permitted configuration sections and links for translation staff", async () => {
		state.viewer = { ...state.viewer!, permissions: ["MANAGE_TRANSLATIONS"] };
		const html = await renderContent(OpsSettingsPage());
		expect(html).toContain('data-testid="configuration-ai-translations"');
		expect(html).toContain('href="/ops/translations"');
		expect(html).not.toContain('data-testid="configuration-customer-support"');
		expect(html).not.toContain('href="/ops/support/settings"');
		expect(html).not.toContain('href="/ops/plugins"');
	});

	it("keeps assigned-brand catalog access for Basic analysts and product-restricted Saleor staff", async () => {
		state.viewer = { username: "analyst", role: "brand_analyst", siteIds: ["fashion"] };
		expect(await renderContent(await BrandSitesPage())).toContain('href="/ops/sites/fashion/catalog"');
		state.viewer = {
			...state.viewer,
			authSource: "saleor",
			permissions: ["MANAGE_PRODUCTS"],
			restrictedAccessToChannels: true,
		};
		const html = await renderContent(await BrandSitesPage());
		expect(html).toContain('href="/ops/sites/fashion/catalog"');
		expect(html).not.toContain('href="/ops/sites/fashion/readiness"');
		expect(html).not.toContain('href="/ops/themes');
	});
});
