import { describe, expect, it } from "vitest";
import { createOpsSession, opsLoginDestination, opsSessionAuthorization } from "./session";
import { authorizeOpsRequest } from "./authorization";

const secret = "a".repeat(40);
const config = { legacySecret: secret, operatorsJson: undefined, trustedSiteIds: ["brand"] };
const basic = (username: string, password: string) => "Basic " + btoa(`${username}:${password}`);

describe("Ops browser sessions", () => {
	it("rejects bad credentials and authenticates a signed session against the current configuration", async () => {
		expect(await createOpsSession(basic("analytics", "wrong"), config)).toBeNull();
		const session = await createOpsSession(basic("analytics", secret), config);
		expect(await opsSessionAuthorization(session!, config)).toBe(basic("analytics", secret));
		expect(await opsSessionAuthorization(session!, { ...config, legacySecret: "b".repeat(40) })).toBeNull();
		expect(await opsSessionAuthorization(session! + "x", config)).toBeNull();
		const parts = session!.split(".");
		parts[1] = "1000000000";
		expect(await opsSessionAuthorization(parts.join("."), config)).toBeNull();
		parts[0] = "platform_owner";
		expect(await opsSessionAuthorization(parts.join("."), config)).toBeNull();
	});

	it("keeps analyst permissions and denies other brands and writes", async () => {
		const scoped = {
			...config,
			operatorsJson: JSON.stringify([
				{ username: "brand_staff", password: secret, role: "brand_analyst", siteIds: ["brand"] },
			]),
		};
		const session = await createOpsSession(basic("brand_staff", secret), scoped);
		const authorization = await opsSessionAuthorization(session!, scoped);
		expect(
			authorizeOpsRequest({ ...scoped, authorization, pathname: "/ops/sites/brand", method: "GET" }),
		).toBe("allowed");
		expect(authorizeOpsRequest({ ...scoped, authorization, pathname: "/ops/plugins", method: "GET" })).toBe(
			"forbidden",
		);
		expect(
			authorizeOpsRequest({ ...scoped, authorization, pathname: "/ops/sites/brand", method: "POST" }),
		).toBe("forbidden");
	});

	it("only returns to an Ops page on this origin", () => {
		expect(opsLoginDestination("/ops/themes?pageType=product")).toBe("/ops/themes?pageType=product");
		for (const target of [
			"//evil.example/ops",
			"/ops/../checkout",
			"/ops\\evil",
			"/ops/login",
			"/ops-other",
			"https://evil.example",
		]) {
			expect(opsLoginDestination(target)).toBe("/ops/plugins");
		}
	});
});
