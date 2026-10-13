import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createCommerceOpsManifest } from "@/lib/ops/saleor-app-manifest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("Saleor App manifest endpoint", () => {
	it("returns a real installable app manifest with direct page extensions", async () => {
		vi.stubEnv("SALEOR_OPS_APP_PUBLIC_URL", "http://localhost:9000");
		const response = await GET(new NextRequest("http://localhost:9000/api/manifest"));
		const manifest = (await response.json()) as ReturnType<typeof createCommerceOpsManifest>;

		expect(response.status).toBe(200);
		expect(manifest).toMatchObject({
			id: "sloer.commerce-operations",
			name: "SLOER 运营管理",
			appUrl: "http://localhost:9000/commerce-admin",
			configurationUrl: "http://localhost:9000/commerce-admin/configuration",
		});
		const extensions = manifest.extensions ?? [];
		expect(extensions).toHaveLength(7);
		expect(extensions.every((extension) => extension.target === "APP_PAGE")).toBe(true);
	});
});
