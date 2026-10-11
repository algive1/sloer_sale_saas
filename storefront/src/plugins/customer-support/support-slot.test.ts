import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ host: "fashion.example.test", paused: false }));
vi.mock("next/cache", () => ({ io: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: state.host }) }));
vi.mock("@/plugins/system/runtime.server", () => ({
	pluginPauseReason: () => (state.paused ? "paused" : null),
}));
import { CustomerSupportSlot } from "./support-slot.server";

beforeEach(() => {
	vi.stubGlobal("React", React);
	state.host = "fashion.example.test";
	state.paused = false;
	vi.stubEnv(
		"STOREFRONT_SITES_JSON",
		JSON.stringify([
			{
				id: "fashion",
				name: "Fashion",
				domains: ["fashion.example.test"],
				channels: ["us"],
				defaultChannel: "us",
			},
			{
				id: "jewelry",
				name: "Jewelry",
				domains: ["jewelry.example.test"],
				channels: ["jewelry-us"],
				defaultChannel: "jewelry-us",
			},
		]),
	);
	vi.stubEnv("SUPPORT_WHATSAPP_SITES_JSON", '[{"siteId":"fashion","phone":"12025550101"}]');
	vi.stubEnv("SUPPORT_CHATWOOT_BASE_URL", "");
	vi.stubEnv("SUPPORT_CHATWOOT_SITES_JSON", "");
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
const markup = async (channel = "us") =>
	renderToStaticMarkup(await CustomerSupportSlot({ params: Promise.resolve({ channel, locale: "fr" }) }));

it("renders only the trusted brand number, without HTTP/SQL calls or shopper context", async () => {
	const fetcher = vi.fn();
	vi.stubGlobal("fetch", fetcher);
	const html = await markup();
	expect(html).toContain("https://wa.me/12025550101");
	expect(html).toContain('referrerPolicy="no-referrer"');
	expect(html).toContain("Bonjour");
	expect(fetcher).not.toHaveBeenCalled();
});
it("never assigns a fallback number to an unconfigured brand, foreign channel or unknown domain", async () => {
	expect(await markup("jewelry-us")).toBe("");
	state.host = "jewelry.example.test";
	expect(await markup("jewelry-us")).toBe("");
	state.host = "unknown.example.test";
	expect(await markup()).toBe("");
});
it("keeps independently valid channels available when another support configuration is malformed", async () => {
	vi.stubEnv("SUPPORT_CHATWOOT_BASE_URL", "https://support.example.test");
	vi.stubEnv("SUPPORT_CHATWOOT_SITES_JSON", "invalid private payload");
	expect(await markup()).toContain("https://wa.me/12025550101");
	vi.stubEnv("SUPPORT_WHATSAPP_SITES_JSON", "invalid");
	vi.stubEnv(
		"SUPPORT_CHATWOOT_SITES_JSON",
		'[{"siteId":"fashion","accountId":1,"websiteToken":"fashion_public_token"},{"siteId":"jewelry","accountId":2,"websiteToken":"jewelry_public_token"}]',
	);
	const html = await markup();
	expect(html).toContain("Discuter avec nous");
	expect(html).not.toContain("wa.me");
});
it("pauses both support launchers before parsing config or accessing request state", async () => {
	state.paused = true;
	vi.stubEnv("SUPPORT_WHATSAPP_SITES_JSON", "invalid");
	expect(await markup()).toBe("");
});
