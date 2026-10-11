import { expect, test } from "@playwright/test";

const origin = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL ?? "http://127.0.0.1:3101";
const auth = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const headers = { Host: "fashion.example.test", Authorization: auth, "x-requested-with": "analytics" };
const endpoint = origin + "/ops/api/analytics/reminders/rules";
// No provider key is configured in this fixture. These tests cannot send emails.
test.describe("brand reminder operations on a built storefront", () => {
	test.describe.configure({ mode: "serial", timeout: 120_000 });
	test("rule writes are authenticated, scoped and independent", async ({ request }) => {
		expect((await request.post(endpoint, { data: {} })).status()).toBe(401);
		expect(
			(
				await request.post(endpoint, { headers: { ...headers, "sec-fetch-site": "cross-site" }, data: {} })
			).status(),
		).toBe(403);
		expect(
			(
				await request.post(endpoint, {
					headers,
					data: { enabled: false, firstAfterHours: 24, secondAfterHours: 72, dailyLimit: 3 },
				})
			).status(),
		).toBe(400);
		const fashion = await request.post(endpoint, {
			headers,
			data: {
				siteId: "fashion-ci",
				enabled: false,
				firstAfterHours: 18,
				secondAfterHours: 60,
				dailyLimit: 3,
			},
		});
		expect(fashion.status(), await fashion.text()).toBe(200);
		const jewelry = await request.get(endpoint + "?siteId=jewelry-ci", { headers });
		expect(jewelry.status()).toBe(200);
		expect((await jewelry.json()).rule).toMatchObject({ enabled: false, firstAfterHours: 24, dailyLimit: 5 });
		const read = await request.get(endpoint + "?siteId=fashion-ci", { headers });
		expect(read.headers()["cache-control"]).toContain("no-store");
		expect((await read.json()).rule).toMatchObject({ firstAfterHours: 18, dailyLimit: 3 });
		const enabled = await request.post(endpoint, {
			headers,
			data: { siteId: "fashion-ci", enabled: true, firstAfterHours: 18, secondAfterHours: 60, dailyLimit: 3 },
		});
		expect(enabled.status()).toBe(409);
		expect((await enabled.json()).error).toBe("brand_sender_not_configured");
	});

	test("backend hydrates, switches brands and persists the selected brand rule", async ({ browser }) => {
		const context = await browser.newContext({
			httpCredentials: { username: "ops_owner", password: "A".repeat(40) },
		});
		const page = await context.newPage();
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		try {
			await page.goto(origin + "/ops/analytics/reminders?siteId=fashion-ci");
			await expect(page.getByRole("heading", { name: "催付设置与发送记录" })).toBeVisible();
			await expect(page.getByRole("heading", { name: "Fashion CI · 发送身份" })).toBeVisible();
			await expect(page.getByText("https://fashion.example.test/order/find", { exact: true })).toBeVisible();
			await expect(page.getByLabel("启用自动付款提醒")).toBeDisabled();
			await page.getByLabel("本品牌每24小时上限（封）").fill("4");
			await page.getByRole("button", { name: "保存规则", exact: true }).click();
			await expect(page.getByRole("status").filter({ hasText: "规则已保存。" })).toBeVisible();
			await page.reload();
			await expect(page.getByLabel("本品牌每24小时上限（封）")).toHaveValue("4");
			await page.getByLabel("品牌", { exact: true }).selectOption("jewelry-ci");
			await page.getByRole("button", { name: "查看设置" }).click();
			await expect(page.getByRole("heading", { name: "Jewelry CI · 发送身份" })).toBeVisible();
			await expect(page.getByLabel("本品牌每24小时上限（封）")).toHaveValue("5");
			await expect(page.getByText("https://jewelry.example.test/order/find", { exact: true })).toBeVisible();
			expect(errors).toEqual([]);
		} finally {
			await context.close();
		}
	});
});
