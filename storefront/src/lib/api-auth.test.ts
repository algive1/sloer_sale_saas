import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "revalidate-secret-value-0123456789abcdef";

async function loadApiAuth(queryAllowed?: string) {
	vi.resetModules();
	vi.stubEnv("REVALIDATE_SECRET", SECRET);
	if (queryAllowed === undefined) {
		vi.stubEnv("REVALIDATE_ALLOW_QUERY_SECRET", "");
	} else {
		vi.stubEnv("REVALIDATE_ALLOW_QUERY_SECRET", queryAllowed);
	}
	return (await import("./api-auth")).extractBearerToken;
}

function request(url: string, headers: Record<string, string> = {}) {
	return new NextRequest(url, { headers });
}

describe("extractBearerToken", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("reads the Authorization bearer token", async () => {
		const extract = await loadApiAuth();
		expect(extract(request("http://localhost/api/revalidate", { authorization: `Bearer ${SECRET}` }))).toBe(
			SECRET,
		);
	});

	it("reads the x-revalidate-secret header", async () => {
		const extract = await loadApiAuth();
		expect(
			extract(request("http://localhost/api/revalidate", { "x-revalidate-secret": SECRET })),
		).toBe(SECRET);
	});

	it("rejects the query-string secret by default", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const extract = await loadApiAuth();

		expect(extract(request("http://localhost/api/revalidate?secret=abc"))).toBeNull();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("?secret="));
	});

	it("accepts the query-string secret only when explicitly allowed", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const extract = await loadApiAuth("true");

		expect(extract(request("http://localhost/api/revalidate?secret=abc"))).toBe("abc");
	});

	it("returns null when no credential is present", async () => {
		const extract = await loadApiAuth();
		expect(extract(request("http://localhost/api/revalidate"))).toBeNull();
	});
});
