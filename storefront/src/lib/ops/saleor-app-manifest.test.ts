import { afterEach, describe, expect, it, vi } from "vitest";
import { createCommerceOpsManifest, getSaleorOpsAppOrigin } from "./saleor-app-manifest";

afterEach(() => vi.unstubAllEnvs());

describe("Saleor Commerce Ops manifest", () => {
	it("uses a deployment-owned secure Dashboard origin", () => {
		vi.stubEnv("SALEOR_OPS_APP_PUBLIC_URL", "https://admin.example.com/");
		vi.stubEnv("SALEOR_DASHBOARD_URL", "https://ignored.example.com");

		expect(getSaleorOpsAppOrigin()).toBe("https://admin.example.com");
	});

	it("allows a loopback HTTP origin for local Compose", () => {
		vi.stubEnv("SALEOR_OPS_APP_PUBLIC_URL", "http://localhost:9000/");
		expect(getSaleorOpsAppOrigin()).toBe("http://localhost:9000");
	});

	it.each([
		"http://admin.example.com",
		"https://user:secret@admin.example.com",
		"https://admin.example.com/dashboard/",
		"https://admin.example.com/?next=https://attacker.example",
	])("rejects an unsafe public origin: %s", value => {
		vi.stubEnv("SALEOR_OPS_APP_PUBLIC_URL", value);
		expect(getSaleorOpsAppOrigin()).toBeNull();
	});

	it("declares direct feature pages and a dedicated Apps configuration view", () => {
		const manifest = createCommerceOpsManifest("https://admin.example.com");

		expect(manifest.appUrl).toBe("https://admin.example.com/commerce-admin");
		expect(manifest.configurationUrl).toBe("https://admin.example.com/commerce-admin/configuration");
		expect(manifest.extensions).toHaveLength(7);
		expect(manifest.extensions?.map(extension => decodeURIComponent(extension.url))).toEqual([
			"/app?path=/ops/analytics",
			"/app?path=/ops/analytics/destinations",
			"/app?path=/ops/analytics/reminders",
			"/app?path=/ops/support",
			"/app?path=/ops/themes",
			"/app?path=/ops/translations",
			"/app?path=/ops/merchant",
		]);
		expect(manifest.tokenTargetUrl).toBeUndefined();
	});
});
