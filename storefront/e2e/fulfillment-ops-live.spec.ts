import { expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL;
test.skip(!base, "Requires isolated multi-brand operations stack");
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");
const path = "/ops/sites/fashion-ci/fulfillment/api";
test("native fulfillment queue enforces brand scope and exports fresh paid physical orders with an audit", async ({ request }) => {
  const own = await request.get(base + path, { headers: { authorization: reader } }); expect(own.status()).toBe(200); expect(own.headers()["cache-control"]).toContain("no-store");
  const snapshot = await own.json(); expect(snapshot.channel).toBe("us"); expect(snapshot.orders.length).toBeGreaterThan(0);
  expect(JSON.stringify(snapshot)).not.toMatch(/shippingAddress|firstName|streetAddress|phone|jewelry-us/);
  expect((await request.get(base + "/ops/sites/jewelry-ci/fulfillment/api", { headers: { authorization: reader, "x-ops-role": "platform_admin" } })).status()).toBe(403);
  expect((await request.get(base + path + "?channel=jewelry-us", { headers: { authorization: reader } })).status()).toBe(400);
  const paid = snapshot.orders.find((order: { exportable: boolean }) => order.exportable); expect(paid, "Native Transactions paid order must be exportable").toBeTruthy();
  const data = { channel: "us", orderIds: [paid.id], confirm: true };
  const headers = { authorization: owner, origin: base!, "x-requested-with": "shipping-export" };
  expect((await request.post(base + path, { headers: { ...headers, authorization: reader }, data })).status()).toBe(403);
  expect((await request.post(base + path, { headers: { ...headers, origin: "https://foreign.example" }, data })).status()).toBe(403);
  expect((await request.post(base + path, { headers, data: { ...data, confirm: false } })).status()).toBe(400);
  const exported = await request.post(base + path, { headers, data }); expect(exported.status()).toBe(200); expect(exported.headers()["x-shipping-export-id"]).toBeTruthy();
  const csv = await exported.text(); expect(csv).toContain('"quantity_to_ship"'); expect(csv).toContain('"recipient"'); expect(csv).toContain(`"${paid.id}"`); expect(csv).not.toContain("jewelry-us");
  const after = await (await request.get(base + path, { headers: { authorization: owner } })).json(); expect(after.orders.find((order: { id: string }) => order.id === paid.id).status).toBe(paid.status);
});
test("administrator selects an order, confirms freight purpose and downloads CSV; analysts stay read-only", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ baseURL: base, httpCredentials: { username: "ops_owner", password: "A".repeat(40) } });
  try {
    const page = await context.newPage(); await page.goto("/ops/sites/fashion-ci/fulfillment"); await expect(page.getByRole("heading", { name: "Fashion CI · 发货与货代交接" })).toBeVisible();
    await expect(page.getByRole("link", { name: "原生发货 ↗" }).first()).toBeVisible();
    await page.locator('input[aria-label^="选择订单 "]:not(:disabled)').first().check();
    await expect(page.getByRole("button", { name: /导出交接CSV/ })).toBeDisabled(); await page.getByRole("checkbox", { name: "我已核对选择，将收件资料仅用于货代履约交接。" }).check();
    const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: /导出交接CSV/ }).click(); expect((await downloadPromise).suggestedFilename()).toBe("fashion-ci-us-shipping.csv");
    await expect(page.getByRole("status")).toContainText("已准备"); await expect(page.getByRole("status")).toContainText("导出没有创建发货");
    await page.reload(); await expect(page.getByText(/ops_owner · \d+笔/).first()).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    if (process.env.OPS_E2E_SCREENSHOT_PATH) await page.screenshot({ path: process.env.OPS_E2E_SCREENSHOT_PATH, fullPage: true });
  } finally { await context.close(); }
  const readContext = await browser.newContext({ baseURL: base, httpCredentials: { username: "fashion_reader", password: "B".repeat(40) } });
  try { const page = await readContext.newPage(); await page.goto("/ops/sites/fashion-ci/fulfillment"); await expect(page.getByRole("heading", { name: "Fashion CI · 发货与货代交接" })).toBeVisible(); await expect(page.getByRole("checkbox")).toHaveCount(0); await expect(page.getByRole("link", { name: "原生订单 ↗" })).toHaveCount(0); }
  finally { await readContext.close(); }
});
