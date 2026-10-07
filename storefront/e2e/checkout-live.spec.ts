import { expect, test, type Page } from "@playwright/test";

const saleorApiUrl = process.env.SALEOR_API_URL ?? "http://127.0.0.1:8000/graphql/";

type CatalogCandidate = {
	slug: string;
	variantId: string;
};

type CapturedCommerceEvent = {
	name?: string;
	step?: string;
	method?: string;
	transactionId?: string;
	[key: string]: unknown;
};

async function discoverInStockUsVariant(): Promise<CatalogCandidate> {
	const response = await fetch(saleorApiUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			query: `
				query BrowserFullFlowProduct($channel: String!) {
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

	throw new Error("No in-stock US product variant found for browser full-flow E2E.");
}

function captureFirstPartyEvents(page: Page): CapturedCommerceEvent[] {
	const events: CapturedCommerceEvent[] = [];
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.pathname !== "/api/analytics/events" || request.method() !== "POST") return;
		try {
			const body = request.postDataJSON() as CapturedCommerceEvent;
			events.push(body);
		} catch {
			// A malformed analytics payload should fail its own server request; it
			// should not make the browser harness itself throw from an event listener.
		}
	});
	return events;
}

async function expectCommerceEvent(
	events: CapturedCommerceEvent[],
	name: string,
	predicate: (event: CapturedCommerceEvent) => boolean = () => true,
) {
	await expect
		.poll(() => events.some((event) => event.name === name && predicate(event)), { timeout: 30_000 })
		.toBe(true);
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

async function expectMetaTrack(page: Page, eventName: string) {
	await expect
		.poll(
			() =>
				page.evaluate((name) => {
					const fbq = (window as unknown as { fbq?: { queue?: ArrayLike<unknown>[] } }).fbq;
					return (fbq?.queue ?? []).some((entry) => {
						const args = Array.from(entry ?? []) as unknown[];
						return args[0] === "track" && args[1] === name;
					});
				}, eventName),
			{ timeout: 30_000 },
		)
		.toBe(true);
}

async function expectTikTokTrack(page: Page, eventName: string) {
	await expect
		.poll(
			() =>
				page.evaluate((name) => {
					const ttq = (window as unknown as { ttq?: unknown[] }).ttq;
					return (Array.isArray(ttq) ? ttq : []).some(
						(entry) => Array.isArray(entry) && entry[0] === "track" && entry[1] === name,
					);
				}, eventName),
			{ timeout: 30_000 },
		)
		.toBe(true);
}

async function expectGoogleAdsPurchase(page: Page) {
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
					return dataLayer.some((entry) => {
						const args = Array.from((entry ?? []) as ArrayLike<unknown>);
						if (args[0] !== "event" || args[1] !== "conversion") return false;
						const params = args[2] as { send_to?: unknown } | undefined;
						return params?.send_to === "AW-123456789/E2E_TEST";
					});
				}),
			{ timeout: 30_000 },
		)
		.toBe(true);
}

test.describe("live US browser commerce flow", () => {
	test.describe.configure({ mode: "serial", timeout: 240_000 });

	test("guest can discover, consent, wishlist, cart, checkout, pay, and emit commerce signals", async ({
		page,
	}) => {
		const candidate = await discoverInStockUsVariant();
		const events = captureFirstPartyEvents(page);

		// Third-party script availability must never decide whether our CI passes.
		// We stub only the downloaded SDK bodies; Paper's real inline bootstrap,
		// consent handling and event projection still execute in the browser.
		await page.route("https://connect.facebook.net/**", (route) =>
			route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
		);
		await page.route("https://analytics.tiktok.com/**", (route) =>
			route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
		);
		await page.route("https://www.googletagmanager.com/**", (route) =>
			route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
		);

		await page.goto(
			`/en/us/products/${encodeURIComponent(candidate.slug)}?variant=${encodeURIComponent(
				candidate.variantId,
			)}&utm_source=e2e&utm_medium=browser&utm_campaign=full_flow`,
		);
		await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

		// Required-mode consent must gate first-party and advertising destinations.
		const consent = page.getByRole("dialog", { name: "Analytics and advertising preferences" });
		await expect(consent).toBeVisible();
		await expect.poll(() => events.length, { timeout: 3_000 }).toBe(0);
		expect(
			await page.evaluate(() => ({
				fbq: typeof (window as unknown as { fbq?: unknown }).fbq,
				ttq: typeof (window as unknown as { ttq?: unknown }).ttq,
			})),
		).toEqual({ fbq: "undefined", ttq: "undefined" });

		await consent.getByRole("button", { name: "Accept", exact: true }).click();

		// The product view happened before consent; Paper must replay it after grant.
		await expectCommerceEvent(events, "product_viewed");
		await expectMetaTrack(page, "ViewContent");
		await expectTikTokTrack(page, "ViewContent");

		const wishlistButton = page.getByRole("button", { name: "Add to wishlist" });
		await wishlistButton.click();
		await expect(page.getByRole("button", { name: "Remove from wishlist" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expectCommerceEvent(events, "wishlist_added");
		await expectMetaTrack(page, "AddToWishlist");
		await expectTikTokTrack(page, "AddToWishlist");

		const addToBag = page.getByRole("button", { name: /add to bag|add to cart/i }).first();
		await expect(addToBag).toBeEnabled({ timeout: 30_000 });
		await addToBag.click();

		const cartButton = page.getByTestId("CartNavItem");
		await expect
			.poll(
				async () => {
					const cookies = await page.context().cookies();
					return cookies.some((cookie) => cookie.name === "checkoutId-us" && Boolean(cookie.value));
				},
				{ timeout: 30_000 },
			)
			.toBe(true);

		await cartButton.click();
		const checkoutLink = page.getByRole("link", { name: /^checkout$/i });
		await expect(checkoutLink).toBeVisible({ timeout: 30_000 });
		await expectCommerceEvent(events, "cart_viewed");
		await checkoutLink.click();

		await expectCheckoutStep(page, "contact");
		await expectCommerceEvent(events, "checkout_started");
		await expectCommerceEvent(events, "checkout_step_viewed", (event) => event.step === "contact");
		await expectMetaTrack(page, "InitiateCheckout");
		await expectTikTokTrack(page, "InitiateCheckout");

		await page.locator('[name="email"]').fill("browser-full-flow@example.com");
		await page.locator('[name="countryCode"]').selectOption("US");
		await setAddressField(page, "firstName", "Browser");
		await setAddressField(page, "lastName", "FullFlow");
		await setAddressField(page, "streetAddress1", "1 Market St");
		await setAddressField(page, "city", "San Francisco");
		await setAddressField(page, "postalCode", "94105");
		await setAddressField(page, "countryArea", "CA");
		await setAddressField(page, "phone", "+14155550123");

		await clickVisibleSubmit(page);
		await expectCheckoutStep(page, "shipping");
		await expectCommerceEvent(events, "checkout_step_viewed", (event) => event.step === "shipping");

		const shippingMethod = page.locator('input[name="shipping"]').first();
		await expect(shippingMethod).toBeAttached({ timeout: 30_000 });
		await shippingMethod.check({ force: true });
		await clickVisibleSubmit(page);

		await expectCheckoutStep(page, "payment");
		await expectCommerceEvent(events, "shipping_method_selected");
		await expectCommerceEvent(events, "checkout_step_viewed", (event) => event.step === "payment");
		await expectMetaTrack(page, "AddPaymentInfo");
		await expectTikTokTrack(page, "AddPaymentInfo");

		await expect(page.getByText("Dummy Payment App", { exact: false }).first()).toBeVisible({
			timeout: 30_000,
		});

		await clickVisibleSubmit(page);
		await expectCommerceEvent(events, "payment_method_selected");

		await expect(page).toHaveURL(/\/order\/[^?]+(?:\?|$)/, { timeout: 60_000 });
		await expect(page.getByText(/Order #?\d+/).first()).toBeVisible({ timeout: 30_000 });
		await expect(page.locator("h1").first()).toBeVisible();

		// Confirmation re-emits the purchase with the same event id for browser
		// ad-pixel enrichment/deduplication while the server owns the reliable copy.
		await expectCommerceEvent(events, "checkout_completed", (event) => Boolean(event.transactionId));
		await expectMetaTrack(page, "Purchase");
		await expectTikTokTrack(page, "CompletePayment");
		await expectGoogleAdsPurchase(page);
	});
});
