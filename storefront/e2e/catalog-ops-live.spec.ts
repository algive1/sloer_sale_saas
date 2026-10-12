import { expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL;
test.skip(!base, "Requires isolated multi-brand operations stack");
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");
const path = "/ops/sites/fashion-ci/catalog/api";
test("catalog templates, validation and live Saleor report keep brand scope", async ({ request }) => {
  const template = await request.get(base + path, { headers: { authorization: reader } }); expect(template.status()).toBe(200); expect(await template.text()).toContain('"us"');
  expect((await request.get(base + "/ops/sites/jewelry-ci/catalog/api", { headers: { authorization: reader } })).status()).toBe(403);
  const headers = { authorization: owner, origin: base!, "x-requested-with": "catalog-validator" };
  const csv = "sku,channel,price,currency,weight_kg,image_url\nHAT,us,20.00,USD,0.25,https://images.example/hat.jpg";
  expect((await request.post(base + path, { headers: { ...headers, authorization: reader }, data: csv })).status()).toBe(403);
  expect((await request.post(base + path, { headers: { ...headers, origin: "https://foreign.example" }, data: csv })).status()).toBe(403);
  const valid = await request.post(base + path, { headers, data: csv }); expect((await valid.json()).valid).toBe(true);
  const invalid = await request.post(base + path, { headers, data: csv.replace(",us,", ",jewelry-us,") }); expect((await invalid.json()).valid).toBe(false);
  expect((await request.get(base + path + "?report=1&channel=jewelry-us", { headers: { authorization: reader } })).status()).toBe(400);
  if (process.env.OPS_CATALOG_REAL_BACKEND === "true") {
    const report = await request.get(base + path + "?report=1", { headers: { authorization: reader } });
    expect(report.status()).toBe(200); expect(report.headers()["cache-control"]).toContain("no-store");
    const data = await report.json(); expect(data.products.length).toBeGreaterThan(0); expect(data.channel).toBe("us");
    expect(JSON.stringify(data.products)).not.toContain("jewelry-us");
  }
});
test("operator uploads CSV, sees exact errors and downloads the complete report", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ baseURL: base, httpCredentials: { username: "ops_owner", password: "A".repeat(40) } });
  try {
    const page = await context.newPage(); await page.goto("/ops/sites/fashion-ci/catalog");
    await expect(page.getByRole("heading", { name: "Fashion CI · 商品发布检查" })).toBeVisible();
    await page.getByLabel("选择CSV", { exact: true }).setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("sku,channel,price,currency,weight_kg,image_url\nHAT,jewelry-us,0,usd,-1,http://images.example/hat.jpg") });
    await page.getByRole("button", { name: "校验资料", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("未写入商品"); await expect(page.getByRole("status")).toContainText("市场不属于当前品牌");
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "下载全部错误" }).click(); expect((await download).suggestedFilename()).toBe("fashion-ci-catalog-errors.csv");
    if (process.env.OPS_CATALOG_REAL_BACKEND === "true") { await expect(page.getByRole("link", { name: "在原生后台编辑 ↗" }).first()).toBeVisible(); }
  } finally { await context.close(); }
});
