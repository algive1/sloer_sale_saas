import { expect, test, type Page } from "@playwright/test";

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL });

const username = process.env.OPS_E2E_USERNAME;
const password = process.env.OPS_E2E_PASSWORD;
const siteId = process.env.OPS_E2E_SITE_ID;
async function signIn(page: Page, baseURL: string | undefined) {
	await page.goto(`${baseURL}/ops/login`);
	await page.locator("#username").fill(username!);
	await page.locator("#password").fill(password!);
	await page.locator('button[type="submit"]').click();
	await expect(page.getByTestId("ops-shell")).toBeVisible();
}
const routes = [
	"/ops/analytics",
	"/ops/analytics/checkout",
	"/ops/analytics/destinations",
	"/ops/analytics/products",
	"/ops/analytics/realtime",
	"/ops/analytics/reminders",
	"/ops/analytics/traffic",
	"/ops/plugins",
	"/ops/merchant",
	"/ops/sites",
	`/ops/sites/${siteId}`,
	`/ops/sites/${siteId}/catalog`,
	`/ops/sites/${siteId}/fulfillment`,
	`/ops/sites/${siteId}/insights`,
	`/ops/sites/${siteId}/readiness`,
	`/ops/sites/${siteId}/realtime`,
	`/ops/sites/${siteId}/tracking`,
	"/ops/support",
	"/ops/support/settings",
	"/ops/themes",
	"/ops/themes?pageType=product",
	"/ops/translations",
];

test.describe("production Ops browser languages", () => {
	test.skip(!username || !password || !siteId, "Requires a configured isolated brand and Ops credentials");
	for (const locale of ["en-US", "zh-CN"]) {
		test(`all 22 pages render in ${locale}`, async ({ browser, baseURL }, testInfo) => {
			test.setTimeout(180_000);
			const context = await browser.newContext({
				locale,
				httpCredentials: { username: username!, password: password! },
			});
			const page = await context.newPage();
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await signIn(page, baseURL);
			for (const [index, route] of routes.entries()) {
				const response = await page.goto(`${baseURL}${route}`);
				expect(response?.status(), route).toBe(200);
				await expect(page.getByTestId("ops-shell")).toBeVisible();
				await page.waitForLoadState("networkidle");
				const text = await page.locator("body").innerText();
				expect(text, route).toContain(locale === "zh-CN" ? "运营管理" : "Commerce operations");
				if (locale === "en-US") expect(text, route).not.toMatch(/\p{Script=Han}/u);
				await expect(page.locator("html")).toHaveAttribute("lang", locale === "zh-CN" ? "zh" : "en");
				await page.screenshot({ path: testInfo.outputPath(`${index}-${locale}.png`), fullPage: true });
			}
			expect(errors).toEqual([]);
			await context.close();
		});
	}
	test("Dashboard language choice survives links and form navigation", async ({ browser, baseURL }) => {
		const context = await browser.newContext({
			locale: "en-US",
			httpCredentials: { username: username!, password: password! },
		});
		const page = await context.newPage();
		await signIn(page, baseURL);
		await page.goto(`${baseURL}/ops/sites?uiLocale=zh-Hans`);
		await page.getByTestId("ops-sidebar").getByRole("link", { name: "系统插件", exact: true }).click();
		await expect(page.getByRole("heading", { name: "系统插件", exact: true })).toBeVisible();
		await page.goto(`${baseURL}/ops/plugins?uiLocale=en`);
		await page.getByTestId("ops-sidebar").getByRole("link", { name: "Brand sites", exact: true }).click();
		await expect(page.getByRole("heading", { name: "Brand sites", exact: true })).toBeVisible();
		await expect(page.locator("body")).not.toContainText("品牌站点");
		await context.close();
	});
});
