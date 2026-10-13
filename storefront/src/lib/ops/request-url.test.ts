import { afterEach, describe, expect, it, vi } from "vitest";
import { opsPublicRequestUrl } from "./request-url";

afterEach(() => vi.unstubAllEnvs());

describe("opsPublicRequestUrl", () => {
	it("uses the configured Dashboard origin for same-origin iframe redirects", () => {
		vi.stubEnv("SALEOR_DASHBOARD_URL", "https://admin.example.com/dashboard/");
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://shop.example.com");

		expect(opsPublicRequestUrl("http://storefront:3000/ops/themes", "admin.example.com"))
			.toEqual(new URL("https://admin.example.com/ops/themes"));
	});

	it("rejects unconfigured host values", () => {
		vi.stubEnv("SALEOR_DASHBOARD_URL", "https://admin.example.com/");
		vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://shop.example.com");

		expect(opsPublicRequestUrl("http://storefront:3000/ops/themes", "attacker.example"))
			.toBeNull();
	});

	it("retains the configured localhost Dashboard origin in local development", () => {
		vi.stubEnv("SALEOR_DASHBOARD_URL", "http://localhost:9000/");
		expect(opsPublicRequestUrl("http://storefront:3000/ops", "localhost:9000"))
			.toEqual(new URL("http://localhost:9000/ops"));
	});
});
