import { expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL;
test.skip(!base, "Requires configured multi-brand operations stack");
const real = process.env.OPS_CATALOG_REAL_BACKEND === "true";
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");
const path = "/ops/sites/fashion-ci/catalog/api";
const report = async (request: import("@playwright/test").APIRequestContext, site = "fashion-ci") => {
	const res = await request.get(base + `/ops/sites/${site}/catalog/api?report=1`, {
		headers: { authorization: owner },
	});
	expect(res.status()).toBe(200);
	return (await res.json()) as {
		products: Array<{
			inventory: Array<{ sku: string }>;
			markets: Array<{
				channel: string;
				prices: Array<{ sku: string; amount: number | null; currency: string }>;
			}>;
		}>;
	};
};
let actualSku: string;
test.beforeAll(async ({ request }) => {
	if (real) {
		expect(process.env.CI).toBe("true");
		const data = await report(request);
		actualSku =
			data.products
				.flatMap((product) => product.markets.filter((market) => market.channel === "us"))
				.flatMap((market) => market.prices)
				.find((price) => price.sku && price.amount !== null)?.sku ?? "";
		expect(actualSku).toBeTruthy();
	} else actualSku = "HAT";
});
const csv = (sku = actualSku, currency = "USD", channel = "us") =>
	`sku,channel,price,currency,weight_kg,image_url\n${sku},${channel},20.00,${currency},0.25,https://images.example.test/example.jpg`;
test("native preflight checks existing SKU, brand market and currency without updating actual prices", async ({
	request,
}) => {
	const headers = {
		authorization: owner,
		host: new URL(base!).host,
		origin: base!,
		"x-requested-with": "catalog-validator",
	};
	expect(
		(
			await request.post(base + path + "?native=1", {
				headers: { ...headers, authorization: reader },
				data: csv(),
			})
		).status(),
	).toBe(403);
	const before = real
		? JSON.stringify((await report(request)).products.map((product) => product.markets))
		: null;
	const good = await request.post(base + path + "?native=1", { headers, data: csv() });
	expect(good.status()).toBe(200);
	expect(good.headers()["cache-control"]).toContain("no-store");
	expect(await good.json()).toMatchObject({ nativeChecked: true, valid: true, rows: 1 });
	const mismatch = await request.post(base + path + "?native=1", { headers, data: csv(actualSku, "EUR") });
	const invalid = await mismatch.json();
	expect(invalid.valid).toBe(false);
	expect(invalid.issues.some((issue: { field: string }) => issue.field === "currency")).toBe(true);
	const missing = await request.post(base + path + "?native=1", {
		headers,
		data: csv("MISSING-PREFLIGHT-FIXTURE-SKU"),
	});
	expect((await missing.json()).valid).toBe(false);
	if (real) {
		const foreign = (await report(request, "jewelry-ci")).products
			.flatMap((product) => product.inventory)
			.find((variant) => variant.sku === "CI-PREFLIGHT-JEWELRY-ONLY")?.sku;
		expect(foreign).toBe("CI-PREFLIGHT-JEWELRY-ONLY");
		const owning = await request.post(base + "/ops/sites/jewelry-ci/catalog/api?native=1", {
			headers,
			data: csv(foreign, "USD", "jewelry-us"),
		});
		expect(owning.status()).toBe(200);
		expect(await owning.json()).toMatchObject({ valid: true, nativeChecked: true });
		const forbidden = await request.post(base + path + "?native=1", { headers, data: csv(foreign) });
		const data = await forbidden.json();
		expect(data.valid).toBe(false);
		expect(JSON.stringify(data)).not.toContain("jewelry-us");
		expect(JSON.stringify((await report(request)).products.map((product) => product.markets))).toBe(before);
	}
});
test("mobile operator distinguishes format success from native success and gets the actual missing-SKU issue", async ({
	browser,
}) => {
	const context = await browser.newContext({
		baseURL: base,
		viewport: { width: 375, height: 812 },
		httpCredentials: { username: "ops_owner", password: "A".repeat(40) },
	});
	try {
		const page = await context.newPage();
		await page.goto("/ops/sites/fashion-ci/catalog");
		// Upload only counts once the client has attached its change handler.
		// Slow first-load hydration must not turn an ignored event into a false failure.
		await expect(async () => {
			await page
				.getByLabel("选择CSV", { exact: true })
				.setInputFiles({ name: "existing.csv", mimeType: "text/csv", buffer: Buffer.from(csv()) });
			await expect(page.getByRole("button", { name: "校验资料", exact: true })).toBeEnabled();
		}).toPass({ timeout: 15_000 });
		await page.getByRole("button", { name: "校验资料", exact: true }).click();
		await expect(page.getByRole("status")).toContainText("格式校验通过，未写入商品");
		await page.getByRole("button", { name: "核对原生SKU与币种", exact: true }).click();
		await expect(page.getByRole("status")).toContainText("SKU与市场币种核对通过，未写入商品");
		await page
			.getByLabel("选择CSV", { exact: true })
			.setInputFiles({
				name: "missing.csv",
				mimeType: "text/csv",
				buffer: Buffer.from(csv("MISSING-PREFLIGHT-FIXTURE-SKU")),
			});
		await page.getByRole("button", { name: "核对原生SKU与币种", exact: true }).click();
		await expect(page.getByRole("status")).toContainText("当前品牌市场找不到唯一现有SKU");
		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "下载全部错误" }).click();
		expect((await download).suggestedFilename()).toBe("fashion-ci-catalog-errors.csv");
	} finally {
		await context.close();
	}
});
