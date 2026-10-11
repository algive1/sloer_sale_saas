import { chromium, expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL ?? "http://127.0.0.1:3101";
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");

test("support operations show both brand numbers and truthful status on mobile", async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 375, height: 812 },
		httpCredentials: { username: "ops_owner", password: "A".repeat(40) },
	});
	try {
		const page = await context.newPage();
		await page.goto(base + "/ops/support");
		await expect(page.getByRole("heading", { name: "WhatsApp 品牌入口", exact: true })).toBeVisible();
		await expect(page.getByRole("link", { name: "+12025550101 · 打开核对 ↗", exact: true })).toBeVisible();
		await expect(page.getByRole("link", { name: "+12025550102 · 打开核对 ↗", exact: true })).toBeVisible();
		await expect(
			page.getByText("号码和品牌绑定格式已通过校验；须在真实品牌手机/电脑测试接收与人工回复。", {
				exact: true,
			}),
		).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
	} finally {
		await context.close();
	}
});

test("public support links and operations diagnostics remain assigned to the trusted brand", async ({
	request,
}) => {
	for (const brand of [
		{ host: "fashion.example.test", path: "/de/us", phone: "12025550101", other: "12025550102" },
		{ host: "jewelry.example.test", path: "/fr/jewelry-us", phone: "12025550102", other: "12025550101" },
	]) {
		const res = await request.get(base + brand.path, { headers: { Host: brand.host } });
		expect(res.status()).toBe(200);
		const html = await res.text();
		expect(html).toContain("https://wa.me/" + brand.phone);
		expect(html).not.toContain("https://wa.me/" + brand.other);
	}
	const ops = await request.get(base + "/ops/support", { headers: { Authorization: owner } });
	expect(ops.status()).toBe(200);
	const html = await ops.text();
	expect(html).toContain("WhatsApp 品牌入口");
	expect(html).toContain("+12025550101");
	expect(html).toContain("+12025550102");
	expect((await request.get(base + "/ops/support", { headers: { Authorization: reader } })).status()).toBe(
		403,
	);
	const wrong = await request.get(base + "/en/us", { headers: { Host: "jewelry.example.test" } });
	expect(wrong.status()).toBe(404);
	expect(await wrong.text()).not.toContain("https://wa.me/");
});

test("mobile support never loads a service before click and recovers from a missing SDK ready event", async () => {
	const browser = await chromium.launch({
		args: ["--no-proxy-server", "--host-resolver-rules=MAP fashion.example.test 127.0.0.1"],
	});
	const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
	try {
		const page = await context.newPage();
		let sdkRequests = 0;
		let whatsappRequests = 0;
		page.on("request", (req) => {
			if (new URL(req.url()).hostname === "wa.me") whatsappRequests++;
		});
		await page.route("https://support.example.test/**", async (route) => {
			sdkRequests++;
			await route.fulfill({
				status: 200,
				contentType: "application/javascript",
				body: `
        window.supportFixtureRuns=0; window.supportFixtureToggles=0;
        window.chatwootSDK={run:()=>{
          window.supportFixtureRuns++;
          if(window.supportFixtureRuns===2){
            window.$chatwoot={toggle:()=>{window.supportFixtureToggles++;}};
            window.dispatchEvent(new Event('chatwoot:ready'));
          }
        }};
      `,
			});
		});
		await page.goto(
			"http://fashion.example.test:" + new URL(base).port + "/en/us?orderToken=never-share-fixture",
		);
		const link = page.getByRole("link", { name: "WhatsApp ↗", exact: true });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
		await expect(link).toHaveAttribute("rel", "noopener noreferrer");
		expect(await link.getAttribute("href")).not.toContain("never-share-fixture");
		expect(sdkRequests).toBe(0);
		expect(whatsappRequests).toBe(0);
		// The production storefront asks for analytics consent first. Decline
		// optional tracking so the dialog does not cover the mobile launcher;
		// customer-requested support must still work without a marketing grant.
		const consent = page.getByRole("dialog", { name: "Analytics and advertising preferences" });
		if (process.env.CI === "true") await expect(consent).toBeVisible();
		if (await consent.isVisible())
			await consent.getByRole("button", { name: "Essential only", exact: true }).click();
		await page.clock.install();
		await page.getByRole("button", { name: "Chat with us", exact: true }).click();
		await expect(page.getByRole("button", { name: "Opening chat…", exact: true })).toBeDisabled();
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as { supportFixtureRuns?: number }).supportFixtureRuns),
			)
			.toBe(1);
		await page.clock.fastForward(16_000);
		const retry = page.getByRole("button", { name: "Chat unavailable. Try again", exact: true });
		await expect(retry).toBeEnabled();
		await retry.click();
		await expect(page.getByRole("button", { name: "Chat with us", exact: true })).toBeEnabled();
		expect(sdkRequests).toBe(1);
		expect(
			await page.evaluate(() => (window as unknown as { supportFixtureRuns: number }).supportFixtureRuns),
		).toBe(2);
		await page.getByRole("button", { name: "Chat with us", exact: true }).click();
		expect(
			await page.evaluate(
				() => (window as unknown as { supportFixtureToggles: number }).supportFixtureToggles,
			),
		).toBe(2);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
		expect(whatsappRequests).toBe(0);
	} finally {
		await context.close();
		await browser.close();
	}
});
