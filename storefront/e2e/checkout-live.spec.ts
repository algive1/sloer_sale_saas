import { expect, test, type Page } from "@playwright/test";

const saleorApiUrl = process.env.SALEOR_API_URL ?? "http://127.0.0.1:8000/graphql/";

type CatalogCandidate = {
	slug: string;
	variantId: string;
};

async function discoverInStockUsVariant(): Promise<CatalogCandidate> {
	const response = await fetch(saleorApiUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			query: `
				query BrowserCheckoutProduct($channel: String!) {
					products(first: 50, channel: $channel) {
						edges {
							node {
								slug
								productVariants(first: 50) {
									edges {
										node {
											id
											quantityAvailable
										}
									}
								}
							}
						}
					}
				}
			`,
			variables: { channel: "us" },
		}),
	});

	if (!response.ok) {
		throw new Error(`Saleor catalog request failed: ${response.status} ${await response.text()}`);
	}

	const payload = (await response.json()) as {
		errors?: Array<{ message?: string }>;
		data?: {
			products?: {
				edges?: Array<{
					node?: {
						slug?: string | null;
						productVariants?: {
							edges?: Array<{
								node?: {
									id?: string | null;
									quantityAvailable?: number | null;
								} | null;
							}>;
						} | null;
					} | null;
				}>;
			};
		};
	};

	if (payload.errors?.length) {
		throw new Error(`Saleor catalog GraphQL errors: ${JSON.stringify(payload.errors)}`);
	}

	for (const productEdge of payload.data?.products?.edges ?? []) {
		const product = productEdge.node;
		if (!product?.slug) continue;

		for (const variantEdge of product.productVariants?.edges ?? []) {
			const variant = variantEdge.node;
			if (variant?.id && (variant.quantityAvailable ?? 0) > 0) {
				return { slug: product.slug, variantId: variant.id };
			}
		}
	}

	throw new Error("No in-stock US product variant found for browser checkout E2E.");
}

async function setAddressField(page: Page, name: string, value: string) {
	const field = page.locator(`[name="${name}"]`).first();
	if ((await field.count()) === 0) return;

	await expect(field).toBeVisible({ timeout: 10_000 });
	const tagName = await field.evaluate((element) => element.tagName.toLowerCase());
	if (tagName === "select") {
		await field.selectOption(value);
	} else {
		await field.fill(value);
	}
}

async function expectCheckoutStep(page: Page, step: "contact" | "shipping" | "payment") {
	await expect
		.poll(() => new URL(page.url()).searchParams.get("step"), { timeout: 30_000 })
		.toBe(step);
}

async function clickVisibleSubmit(page: Page) {
	const submit = page.locator('form button[type="submit"]:visible').last();
	await expect(submit).toBeEnabled({ timeout: 30_000 });
	await submit.click();
}

test.describe("live US guest checkout", () => {
	test.describe.configure({ mode: "serial", timeout: 180_000 });

	test("customer can buy an in-stock product with the official Dummy Payment App", async ({ page }) => {
		const candidate = await discoverInStockUsVariant();

		await page.goto(`/en/us/products/${encodeURIComponent(candidate.slug)}?variant=${encodeURIComponent(
			candidate.variantId,
		)}`);
		await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

		const addToBag = page.getByRole("button", { name: /add to bag|add to cart/i }).first();
		await expect(addToBag).toBeEnabled({ timeout: 30_000 });
		await addToBag.click();

		const checkoutId = await expect
			.poll(
				async () => {
					const cookies = await page.context().cookies();
					return cookies.find((cookie) => cookie.name === "checkoutId-us" && cookie.value)?.value ?? null;
				},
				{ timeout: 30_000 },
			)
			.not.toBeNull()
			.then(async () => {
				const cookies = await page.context().cookies();
				return cookies.find((cookie) => cookie.name === "checkoutId-us" && cookie.value)?.value;
			});

		if (!checkoutId) {
			throw new Error("checkoutId-us cookie missing after add-to-cart");
		}

		await page.goto(`/checkout?checkout=${encodeURIComponent(checkoutId)}&step=contact&locale=en`);
		await expectCheckoutStep(page, "contact");

		await page.locator('[name="email"]').fill("browser-checkout@example.com");
		await page.locator('[name="countryCode"]').selectOption("US");
		await setAddressField(page, "firstName", "Browser");
		await setAddressField(page, "lastName", "Checkout");
		await setAddressField(page, "streetAddress1", "1 Market St");
		await setAddressField(page, "city", "San Francisco");
		await setAddressField(page, "postalCode", "94105");
		await setAddressField(page, "countryArea", "CA");
		await setAddressField(page, "phone", "+14155550123");

		await clickVisibleSubmit(page);
		await expectCheckoutStep(page, "shipping");

		const shippingMethod = page.locator('input[name="shipping"]').first();
		await expect(shippingMethod).toBeAttached({ timeout: 30_000 });
		await shippingMethod.check({ force: true });
		await clickVisibleSubmit(page);
		await expectCheckoutStep(page, "payment");

		await expect(page.getByText("Dummy Payment App", { exact: false }).first()).toBeVisible({
			timeout: 30_000,
		});

		await clickVisibleSubmit(page);

		await expect(page).toHaveURL(/\/order\/[^?]+(?:\?|$)/, { timeout: 60_000 });
		await expect(page.getByText(/Order #\d+/).first()).toBeVisible({ timeout: 30_000 });
		await expect(page.locator("h1").first()).toBeVisible();
	});
});
