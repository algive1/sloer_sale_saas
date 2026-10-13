import { expect, test } from "@playwright/test";

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

const browsePath = process.env.STOREFRONT_E2E_BROWSE_PATH ?? "/en/default-channel";

test("streamed homepage and product list retain the footer before hydration", async ({ page }) => {
	// Allow React's inline stream replacement, but prevent hydration from repairing malformed HTML.
	await page.route("**/_next/static/chunks/*.js", (route) => route.abort());
	for (const path of [browsePath, `${browsePath}/products`]) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("footer")).toHaveCount(1);
		await expect(page.locator("footer")).toContainText("©");
	}
});

test("browse surfaces hydrate without JavaScript errors", async ({ page }, testInfo) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	for (const [index, suffix] of [
		"",
		"/products",
		"/search?query=acceptance",
		"/cart",
		"/wishlist",
		"/login",
		"/signup",
	].entries()) {
		const response = await page.goto(`${browsePath}${suffix}`);
		expect(response?.status(), suffix).toBe(200);
		await expect(page.locator("#storefront-header")).toBeVisible();
		await expect(page.locator("footer")).toHaveCount(1);
		await expect(page.locator("footer")).toContainText("©");
		await page.waitForLoadState("networkidle");
		await page.screenshot({ path: testInfo.outputPath(`${index}-browse.png`), fullPage: true });
		expect(errors, suffix || "homepage").toEqual([]);
	}
});

test("footer survives client navigation and an empty checkout loads", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(browsePath);
	await expect(page.locator("footer")).toHaveCount(1);
	await expect(page.locator("footer")).toContainText("©");
	await page.locator(`footer a[href="${browsePath}/products"]`).first().click();
	await expect(page).toHaveURL(new RegExp(`${browsePath}/products$`));
	await page.waitForLoadState("networkidle");
	await expect(page.locator("footer")).toContainText("©");
	const response = await page.goto("/checkout");
	expect(response?.status()).toBe(200);
	await page.waitForLoadState("networkidle");
	expect(errors).toEqual([]);
});
