import { afterEach, expect, it, vi } from "vitest";
import { executeRawGraphQL } from "./graphql";
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
it("catalog opt-in rejects partial GraphQL data while legacy callers retain their prior semantics", async () => {
	vi.stubEnv("SALEOR_INTERNAL_API_URL", "http://native.test/graphql/");
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json({
				data: { products: { edges: [] } },
				errors: [{ message: "catalog failed", extensions: { code: "INTERNAL_ERROR" } }],
			}),
		),
	);
	expect(
		(await executeRawGraphQL({ query: "query SitemapProducts {products {id}}", rejectPartialData: true })).ok,
	).toBe(false);
	expect((await executeRawGraphQL({ query: "query Legacy {products {id}}" })).ok).toBe(true);
});
it("passes a timeout AbortSignal to the request without adding automatic retries", async () => {
	vi.stubEnv("SALEOR_INTERNAL_API_URL", "http://native.test/graphql/");
	const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		throw new DOMException("expired", "TimeoutError");
	});
	vi.stubGlobal("fetch", fetcher);
	const result = await executeRawGraphQL({
		query: "query SitemapProducts {products {id}}",
		rejectPartialData: true,
		timeoutMs: 1000,
	});
	expect(result.ok).toBe(false);
	expect(fetcher).toHaveBeenCalledTimes(1);
});
