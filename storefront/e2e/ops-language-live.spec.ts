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
	"/ops/settings",
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

test.describe("embedded support navigation", () => {
	test.skip(!username || !password, "Requires an Ops operator login");
	test("keeps the inner navigation hidden through support settings and back", async ({
		page,
		baseURL,
	}, testInfo) => {
		await signIn(page, baseURL);
		await page.goto(`${baseURL}/ops/support?uiLocale=en`);
		await expect(page.getByTestId("ops-sidebar")).toBeVisible();

		// Only the parent frame is a test harness; the authenticated Ops pages
		// and their real Next Link transitions are served by the running app.
		await page.route("**/ops-embedding-test", (route) =>
			route.fulfill({
				contentType: "text/html",
				body: '<!doctype html><iframe name="support-workbench" title="Support workbench" src="/ops/support?embedded=1&uiLocale=en" style="width:100%;height:95vh;border:0"></iframe>',
			}),
		);
		await page.goto(`${baseURL}/ops-embedding-test`);
		const frame = page.frameLocator('iframe[name="support-workbench"]');
		await expect(frame.getByTestId("ops-shell")).toBeVisible();
		await expect(frame.getByTestId("ops-sidebar")).toBeHidden();
		await frame.locator('[data-testid^="chatwoot-inbox"] a[href="/ops/support/settings"]').click();
		await expect(frame.getByRole("heading", { name: /WhatsApp/ })).toBeVisible();
		const child = page.frame({ name: "support-workbench" });
		expect(child).not.toBeNull();
		expect(new URL(child!.url()).pathname).toBe("/ops/support/settings");
		expect(new URL(child!.url()).searchParams.get("embedded")).toBeNull();
		await page.screenshot({ path: testInfo.outputPath("support-settings-navigation.png"), fullPage: true });
		await expect(frame.getByTestId("ops-sidebar")).toBeHidden();
		await frame.locator('main a[href="/ops/support"]').click();
		await expect(
			frame.locator('[data-testid="chatwoot-inbox"], [data-testid="chatwoot-inbox-unconfigured"]'),
		).toBeVisible();
		await expect(frame.getByTestId("ops-sidebar")).toBeHidden();
	});
	for (const locale of ["en", "zh"] as const) {
		test(`configuration center stays embedded and reachable in ${locale}`, async ({
			page,
			baseURL,
		}, testInfo) => {
			const errors: string[] = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await signIn(page, baseURL);
			await page.route("**/ops-embedding-test", (route) =>
				route.fulfill({
					contentType: "text/html",
					body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe name="configuration" title="Configuration" src="/ops/support/settings?embedded=1&uiLocale=${locale}" style="width:100%;height:95vh;border:0"></iframe>`,
				}),
			);
			await page.goto(`${baseURL}/ops-embedding-test`);
			const frame = page.frameLocator('iframe[name="configuration"]');
			await expect(frame.getByTestId("ops-sidebar")).toBeHidden();
			await expect(frame.getByTestId("ops-configuration-link")).toHaveAttribute(
				"href",
				"/ops/settings#customer-support",
			);
			await frame.getByTestId("ops-configuration-link").click();
			await expect(frame.getByTestId("ops-configuration")).toBeVisible();
			await expect(frame.locator('[data-testid^="configuration-"]')).toHaveCount(7);
			await expect(
				frame.getByRole("heading", {
					name: locale === "zh" ? "配置中心" : "Configuration center",
					exact: true,
				}),
			).toBeVisible();
			await expect(frame.getByTestId("ops-sidebar")).toBeHidden();
			await frame.locator('nav a[href="#customer-support"]').click();
			await frame
				.getByTestId("configuration-customer-support")
				.locator('a[href="/ops/support/settings"]')
				.click();
			await expect(frame.getByRole("heading", { name: /WhatsApp/ })).toBeVisible();
			await expect(frame.getByTestId("ops-sidebar")).toBeHidden();
			await frame.getByTestId("ops-configuration-link").click();
			const child = page.frame({ name: "configuration" });
			await expect(frame.getByTestId("ops-configuration")).toBeVisible();
			if (locale === "en") expect(await child!.locator("body").innerText()).not.toMatch(/\p{Script=Han}/u);
			await child!.locator("body").evaluate((element) => {
				element.ownerDocument.defaultView!.scrollTo(0, 0);
			});
			await page.screenshot({ path: testInfo.outputPath(`configuration-${locale}-desktop.png`) });
			await page.setViewportSize({ width: 375, height: 812 });
			await expect(frame.getByTestId("ops-sidebar")).toBeHidden();
			expect(
				await child!.locator("body").evaluate((element) => element.scrollWidth <= element.clientWidth),
			).toBe(true);
			await page.screenshot({ path: testInfo.outputPath(`configuration-${locale}-mobile.png`) });
			expect(errors).toEqual([]);
			await page.goto(`${baseURL}/ops/settings`);
			await page
				.getByRole("button", { name: locale === "zh" ? "打开运营菜单" : "Open operations menu" })
				.click();
			await expect(page.getByTestId("ops-sidebar")).toBeVisible();
		});
	}
});

test.describe("production Ops browser languages", () => {
	test.skip(!username || !password || !siteId, "Requires a configured isolated brand and Ops credentials");
	for (const locale of ["en-US", "zh-CN"]) {
		test(`all 23 pages render in ${locale}`, async ({ browser, baseURL }, testInfo) => {
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
