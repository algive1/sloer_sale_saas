import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createSaleorOpsSession,
	getSaleorOpsSessionSecret,
	SALEOR_OPS_SESSION_SECONDS,
	saleorOpsSessionViewer,
	type SaleorOpsIdentity,
} from "./saleor-session";

const secret = "s".repeat(40);
const now = 1_800_000_000;
const identity: SaleorOpsIdentity = {
	id: "U2FsZW9yU3RhZmY6MQ==",
	email: "staff@example.com",
	isStaff: true,
	permissions: ["MANAGE_ORDERS", "MANAGE_PRODUCTS"],
	restrictedAccessToChannels: true,
	siteIds: ["fashion"],
};

afterEach(() => vi.unstubAllEnvs());

function accessToken(expiresAt: number): string {
	const payload = btoa(JSON.stringify({ exp: expiresAt }))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
	return `header.${payload}.signature`;
}

describe("Saleor Ops sessions", () => {
	it("prefers a dedicated signing key and supports the existing server-side Ops secrets", () => {
		vi.stubEnv("SALEOR_OPS_SESSION_SECRET", "dedicated-session-secret".padEnd(40, "x"));
		vi.stubEnv("OPS_OPERATORS_JSON", '[{"username":"ops","password":"secret"}]');
		vi.stubEnv("ANALYTICS_DASHBOARD_SECRET", "legacy-secret");
		expect(getSaleorOpsSessionSecret()).toBe("dedicated-session-secret".padEnd(40, "x"));

		vi.stubEnv("SALEOR_OPS_SESSION_SECRET", "");
		expect(getSaleorOpsSessionSecret()).toBe('[{"username":"ops","password":"secret"}]');

		vi.stubEnv("OPS_OPERATORS_JSON", "");
		expect(getSaleorOpsSessionSecret()).toBe("legacy-secret");
	});

	it("signs a short-lived session without retaining the Saleor access token", async () => {
		const token = accessToken(now + SALEOR_OPS_SESSION_SECONDS * 2);
		const session = await createSaleorOpsSession(identity, token, secret, now);

		expect(session?.maxAge).toBe(SALEOR_OPS_SESSION_SECONDS);
		expect(session?.value).not.toContain(token);
		expect(await saleorOpsSessionViewer(session?.value, secret, now)).toEqual({
			username: "staff@example.com",
			role: "brand_analyst",
			siteIds: ["fashion"],
			authSource: "saleor",
			permissions: ["MANAGE_ORDERS", "MANAGE_PRODUCTS"],
			restrictedAccessToChannels: true,
		});
	});

	it("never outlives the verified Saleor token", async () => {
		const session = await createSaleorOpsSession(identity, accessToken(now + 90), secret, now);

		expect(session?.maxAge).toBe(90);
		expect(await saleorOpsSessionViewer(session?.value, secret, now + 90)).toBeNull();
	});

	it("rejects invalid, expired, forged and differently signed sessions", async () => {
		const session = await createSaleorOpsSession(identity, accessToken(now + 600), secret, now);

		expect(await createSaleorOpsSession(identity, "not-a-jwt", secret, now)).toBeNull();
		expect(await createSaleorOpsSession(identity, accessToken(now + 20), secret, now)).toBeNull();
		expect(await saleorOpsSessionViewer(session?.value, secret, now + SALEOR_OPS_SESSION_SECONDS)).toBeNull();
		expect(await saleorOpsSessionViewer(session?.value, "x".repeat(40), now)).toBeNull();
		expect(await saleorOpsSessionViewer(`${session?.value}x`, secret, now)).toBeNull();
	});
});
