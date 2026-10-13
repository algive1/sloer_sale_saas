import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "./route";
import { OPS_SESSION_COOKIE, opsSessionAuthorization } from "@/lib/ops/session";

vi.mock("@/config/brand-sites", () => ({ getBrandSites: () => null, brandSiteForHost: () => null }));
vi.mock("@/lib/auth/auth-rate-limit", () => ({ rejectIfRateLimited: () => null }));
const secret = "x".repeat(40);

beforeEach(() => {
	vi.stubEnv("ANALYTICS_DASHBOARD_SECRET", secret);
	vi.stubEnv("OPS_OPERATORS_JSON", "");
	vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "http://localhost:3000");
});

function login(password: string, origin = "http://localhost:3000", next = "/ops/themes?pageType=product") {
	return new NextRequest(`http://localhost:3000/ops/login?next=${encodeURIComponent(next)}`, {
		method: "POST",
		headers: { origin, "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ username: "analytics", password }),
	});
}

describe("Ops login HTTP boundary", () => {
	it("shows English according to the browser and honors the embedded language", async () => {
		expect(
			await GET(
				new NextRequest("http://localhost:3000/ops/login", { headers: { "accept-language": "en-US" } }),
			).text(),
		).toContain("Operations sign-in");
		const next = encodeURIComponent("/ops/themes?uiLocale=zh-Hans");
		expect(
			await GET(
				new NextRequest(`http://localhost:3000/ops/login?next=${next}`, {
					headers: { "accept-language": "en-US" },
				}),
			).text(),
		).toContain("运营后台登录");
	});
	it("shows Chinese login copy without rendering a protected shell", async () => {
		const response = GET(
			new NextRequest("http://localhost:3000/ops/login?next=//evil.example", {
				headers: { "accept-language": "zh-CN" },
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("运营后台登录");
		expect(response.headers.get("cache-control")).toContain("no-store");
	});

	it("returns to the selected page with an HttpOnly authenticated cookie", async () => {
		const response = await POST(login(secret));
		if (!(response instanceof NextResponse)) throw new Error("Expected a login redirect");
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("http://localhost:3000/ops/themes?pageType=product");
		expect(response.headers.get("set-cookie")).toContain("HttpOnly");
		expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
		const session = response.cookies.get(OPS_SESSION_COOKIE)?.value;
		// Chatwoot's existing gateway is /api/ops/chatwoot, outside /ops.
		expect(response.cookies.get(OPS_SESSION_COOKIE)?.path).toBe("/");
		expect(
			await opsSessionAuthorization(session, { operatorsJson: "", legacySecret: secret, trustedSiteIds: [] }),
		).toBe("Basic " + btoa(`analytics:${secret}`));
	});

	it("rejects wrong credentials, cross-origin login and external return URLs", async () => {
		expect((await POST(login("wrong"))).headers.get("location")).toContain("error=credentials");
		expect((await POST(login("无效密码"))).headers.get("location")).toContain("error=credentials");
		expect((await POST(login(secret, "https://evil.example"))).status).toBe(403);
		expect(
			(await POST(login(secret, "http://localhost:3000", "//evil.example"))).headers.get("location"),
		).toBe("http://localhost:3000/ops/plugins");
	});

	it("removes the session on same-origin logout", async () => {
		const response = await POST(
			new NextRequest("http://localhost:3000/ops/login?action=logout", {
				method: "POST",
				headers: { origin: "http://localhost:3000" },
			}),
		);
		expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(response.headers.get("location")).toBe("http://localhost:3000/ops/login");
	});

	it("uses the configured public origin behind a container and rejects a forged Host", async () => {
		const response = await POST(
			new NextRequest("http://container:3000/ops/login?next=/ops/plugins", {
				method: "POST",
				headers: {
					host: "localhost:3000",
					origin: "http://localhost:3000",
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ username: "analytics", password: secret }),
			}),
		);
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe("http://localhost:3000/ops/plugins");
		const forged = await POST(
			new NextRequest("http://container:3000/ops/login", {
				method: "POST",
				headers: { host: "evil.example", origin: "http://evil.example" },
			}),
		);
		expect(forged.status).toBe(403);
	});
});
