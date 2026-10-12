import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeRawGraphQL = vi.fn();
const assertPluginActive = vi.fn();

vi.mock("@/lib/graphql", () => ({ executeRawGraphQL }));
vi.mock("@/plugins/system/runtime.server", () => ({ assertPluginActive }));

function productPage(slug: string, hasNextPage: boolean, endCursor: string | null) {
	return {
		ok: true as const,
		data: {
			products: {
				pageInfo: { hasNextPage, endCursor },
				edges: [
					{
						node: {
							id: `gid://${slug}`,
							name: slug,
							slug,
							description: null,
							seoDescription: null,
							isAvailable: true,
							thumbnail: null,
							media: [],
							brand: null,
							googleProductCategory: null,
							gender: null,
							ageGroup: null,
							translation: null,
							productVariants: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, edges: [] },
						},
					},
				],
			},
		},
	};
}

describe("fetchGoogleMerchantProducts scan budget", () => {
	beforeEach(() => {
		vi.resetModules();
		executeRawGraphQL.mockReset();
		assertPluginActive.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns the full catalog when the last page arrives within the budget", async () => {
		const { fetchGoogleMerchantProducts } = await import("./google-feed-source");
		executeRawGraphQL
			.mockResolvedValueOnce(productPage("a", true, "cursor-a"))
			.mockResolvedValueOnce(productPage("b", false, null));

		const products = await fetchGoogleMerchantProducts("us", "en");

		expect(products.map((product) => product.slug)).toEqual(["a", "b"]);
		expect(executeRawGraphQL).toHaveBeenCalledTimes(2);
	});

	it("refuses to emit a truncated feed once the page budget is exhausted", async () => {
		vi.stubEnv("GOOGLE_MERCHANT_FEED_MAX_PAGES", "2");
		const { fetchGoogleMerchantProducts, MerchantFeedBudgetError } = await import("./google-feed-source");
		executeRawGraphQL.mockImplementation(async () => productPage("loop", true, "same-cursor"));

		await expect(fetchGoogleMerchantProducts("us", "en")).rejects.toThrow(MerchantFeedBudgetError);
		await expect(fetchGoogleMerchantProducts("us", "en")).rejects.toThrow("merchant_feed_page_limit_exceeded");
	});

	it("gives up when the wall-clock budget is exceeded", async () => {
		vi.stubEnv("GOOGLE_MERCHANT_FEED_BUDGET_MS", "1");
		const { fetchGoogleMerchantProducts } = await import("./google-feed-source");
		executeRawGraphQL.mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			return productPage("slow", true, "cursor-slow");
		});

		await expect(fetchGoogleMerchantProducts("us", "en")).rejects.toThrow("merchant_feed_budget_exceeded");
	});
});
