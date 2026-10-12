import { expect, test, type APIRequestContext } from "@playwright/test";
import { publicSitemapLocations } from "./helpers/sitemap";

const dashboard = process.env.PLAYWRIGHT_NATIVE_DASHBOARD_URL;
test.skip(!dashboard, "Requires the disposable native Dashboard integration stack");
test.setTimeout(120_000);
type Variant = {
	id: string;
	channelListings: Array<{ channel: { id: string }; price: { amount: number } | null }>;
};
type Listing = {
	channel: { id: string };
	isPublished: boolean;
	visibleInListings: boolean;
	isAvailableForPurchase: boolean;
};
const readProduct = async (request: APIRequestContext) => {
	const variants: Variant[] = [];
	let after: string | null = null;
	let listings: Listing[] = [];
	for (let page = 0; page < 5; page += 1) {
		const response = await request.post(process.env.SALEOR_API_URL!, {
			headers: { authorization: `Bearer ${process.env.OPS_CATALOG_SALEOR_TOKEN!}` },
			data: {
				query: `query BulkSafetyReceipt($id: ID!, $after: String) {
        product(id: $id) {
          channelListings { channel { id } isPublished visibleInListings isAvailableForPurchase }
          productVariants(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges { node { id channelListings { channel { id } price { amount } } } }
          }
        }
      }`,
				variables: { id: process.env.CI_NATIVE_BULK_PRODUCT_ID, after },
			},
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.errors).toBeUndefined();
		expect(body.data.product).toBeTruthy();
		const product = body.data.product;
		listings = product.channelListings;
		variants.push(...product.productVariants.edges.map((edge: { node: Variant }) => edge.node));
		if (!product.productVariants.pageInfo.hasNextPage) return { variants, listings };
		const next = product.productVariants.pageInfo.endCursor;
		expect(next).toBeTruthy();
		expect(next).not.toBe(after);
		after = next;
	}
	throw new Error("Native bulk receipt exceeded the supported page count");
};

test("real 101-variant native wizard keeps failed writes unpublished and publishes after manual retry", async ({
	browser,
	request,
}) => {
	expect(process.env.CI).toBe("true");
	expect(process.env.CI_NATIVE_BULK_REFRESH_TOKEN).toBeTruthy();
	const channelId = process.env.CI_NATIVE_BULK_CHANNEL_ID!;
	const initial = await readProduct(request);
	const liveCache = process.env.NATIVE_CATALOG_WEBHOOK_REAL === "true";
	const publicOrigin = process.env.PLAYWRIGHT_NATIVE_BULK_ENTRY_URL!;
	if (liveCache) {
		const before = await publicSitemapLocations(request, publicOrigin, "jewelry.example.test");
		expect(before.locations.some((url) => url.endsWith("/products/ci-bulk-safety"))).toBe(false);
		const invalid = await request.post(publicOrigin + "/api/revalidate", {
			headers: { "saleor-event": "product_updated", "saleor-signature": "0".repeat(64) },
			data: { product: { slug: "ci-bulk-safety" } },
		});
		expect(invalid.status()).toBe(401);
	}
	expect(initial.variants).toHaveLength(101);
	expect(initial.listings).toHaveLength(1);
	expect(initial.listings[0]).toMatchObject({ channel: { id: channelId }, isPublished: false });
	expect(initial.variants.every((variant) => variant.channelListings[0]?.price?.amount === 19.99)).toBe(true);
	const context = await browser.newContext({
		httpCredentials: { username: "ops_owner", password: "A".repeat(40) },
		storageState: {
			cookies: [],
			origins: [
				{
					origin: new URL(dashboard!).origin,
					localStorage: [{ name: "_saleorRefreshToken", value: process.env.CI_NATIVE_BULK_REFRESH_TOKEN! }],
				},
			],
		},
	});
	try {
		let page = await context.newPage();
		let injectFailure = true;
		let injected = false;
		const chunks: number[] = [];
		const variantCursors: Array<string | null> = [];
		// Fault injection changes one request value; Saleor still executes the real mutation.
		// REJECT_FAILED_ROWS can save other rows, so publication and all final prices are reread.
		await context.route("**/graphql/", async (route) => {
			const body = route.request().postDataJSON();
			if (body?.operationName === "BulkPublishProductVariants") variantCursors.push(body.variables.after);
			if (body?.operationName === "ProductVariantBulkUpdate") {
				chunks.push(body.variables.input.length);
				if (injectFailure) {
					injectFailure = false;
					injected = true;
					body.variables.input[0].channelListings.update[0].price = "20.001";
					await route.continue({ postData: JSON.stringify(body) });
					return;
				}
			}
			await route.continue();
		});
		const target = `${dashboard!.replace(/\/$/, "")}/channels/${encodeURIComponent(channelId)}?action=bulk-publish`;
		if (process.env.PLAYWRIGHT_NATIVE_BULK_ENTRY_URL) {
			await page.goto(
				process.env.PLAYWRIGHT_NATIVE_BULK_ENTRY_URL + "/ops/sites/jewelry-ci/catalog?channel=jewelry-us",
			);
			const entry = page.getByRole("link", { name: "在原生后台批量定价、库存与发布 ↗" });
			await expect(entry).toHaveAttribute("href", target);
			await expect(entry).toHaveAttribute("rel", "noopener noreferrer");
			const popup = context.waitForEvent("page");
			await entry.click();
			page = await popup;
		} else await page.goto(target);
		const exclude = page.locator('input[name="excludeListedInChannel"]');
		await expect(exclude).toBeChecked({ timeout: 30_000 });
		await exclude.uncheck();
		const row = page
			.locator('[data-test-id="assign-product-table-row"]')
			.filter({ hasText: "AA CI bulk safety" });
		await expect(row).toHaveCount(1);
		await row.getByRole("checkbox").check();
		await page.locator('[data-test-id="bulk-publish-next"]').click();
		await page.getByRole("checkbox", { name: "Also set stock levels" }).uncheck();
		await page.locator('[data-test-id="bulk-publish-next"]').click();
		await page.getByRole("textbox", { name: "Price", exact: true }).fill("20.00");
		await page.locator('[data-test-id="bulk-publish-next"]').click();
		await page.locator('[data-test-id="bulk-publish-submit"]').click();
		await expect(page.locator('[data-test-id="bulk-publish-retry"]')).toBeEnabled();
		expect(injected).toBe(true);
		const failed = await readProduct(request);
		expect(failed.listings[0]).toMatchObject({
			isPublished: false,
			visibleInListings: false,
			isAvailableForPurchase: false,
		});
		expect(failed.variants.some((variant) => variant.channelListings[0]?.price?.amount === 20)).toBe(true);
		expect(failed.variants.some((variant) => variant.channelListings[0]?.price?.amount === 19.99)).toBe(true);
		await page.locator('[data-test-id="bulk-publish-retry"]').click();
		await expect(page.locator('[data-test-id="bulk-publish-channel-name"]')).toHaveCount(0, {
			timeout: 30_000,
		});
		const completed = await readProduct(request);
		expect(completed.variants).toHaveLength(101);
		expect(completed.listings).toHaveLength(1);
		expect(completed.listings[0]).toMatchObject({
			channel: { id: channelId },
			isPublished: true,
			visibleInListings: true,
			isAvailableForPurchase: true,
		});
		expect(
			completed.variants.every(
				(variant) =>
					variant.channelListings.length === 1 &&
					variant.channelListings[0].channel.id === channelId &&
					variant.channelListings[0].price?.amount === 20,
			),
		).toBe(true);
		expect(chunks).toEqual([100, 100, 1]);
		expect(variantCursors.filter((cursor) => cursor !== null)).toHaveLength(2);
		if (liveCache) {
			// No manual purge: the real worker must deliver Saleor's signed event.
			await expect(async () => {
				const after = await publicSitemapLocations(request, publicOrigin, "jewelry.example.test");
				expect(after.locations).toContain(
					"https://jewelry.example.test/en/jewelry-us/products/ci-bulk-safety",
				);
			}).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 5_000] });
		}
	} finally {
		await context.close();
	}
});
