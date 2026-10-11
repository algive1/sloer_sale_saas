import { expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_PLUGIN_PAUSE_BASE_URL;
test.skip(!base, "Requires a storefront process with all four optional modules paused after build");
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");
test("paused Ops writes keep authentication and role checks, while status/history stay readable", async ({ request }) => {
  for (const path of ["/ops/themes/api", "/ops/themes/ai/images/generate", "/ops/translations/api", "/ops/api/analytics/reminders/run"]) {
    expect((await request.post(base + path, { data: {} })).status()).toBe(401);
    expect((await request.post(base + path, { headers: { authorization: reader }, data: {} })).status()).toBe(403);
    const response = await request.post(base + path, { headers: { authorization: owner }, data: {} });
    expect(response.status()).toBe(503); expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ error: "plugin_paused" });
  }
  const status = await request.get(base + "/ops/plugins", { headers: { authorization: owner } });
  expect(status.status()).toBe(200); const html = await status.text();
  expect(html).toContain("已暂停：部署控制"); expect(html).toContain("统一暂停尚未接入");
  const history = await request.get(base + "/ops/api/analytics/reminders/rules?siteId=fashion-ci", { headers: { authorization: owner } });
  expect(history.status()).toBe(200);
});
test("paused worker endpoints retain bearer authentication and return an explicit skip", async ({ request }) => {
  for (const path of ["/api/plugins/customer-support/agent-bot-worker", "/api/plugins/ai-translations/worker"]) {
    expect((await request.post(base + path)).status()).toBe(401);
    const response = await request.post(base + path, { headers: { authorization: "Bearer ci-plugin-paused-worker-secret-123456789" } });
    expect(response.status()).toBe(503); expect(await response.json()).toEqual({ skipped: true, reason: "plugin_paused" });
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});
test("the shared production build still serves native catalog with optional modules paused", async ({ request }) => {
  test.skip(process.env.OPS_PLUGIN_REAL_BACKEND !== "true", "Native catalog acceptance runs against actual Saleor in CI");
  const response = await request.get(base + "/en/us", { headers: { host: "fashion.example.test" } });
  expect(response.status()).toBe(200); expect(await response.text()).not.toContain("support.chatwoot.com");
});

test("plugin status clearly separates the four paused modules from the three unsupported modules on mobile", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 812 }, httpCredentials: { username: "ops_owner", password: "A".repeat(40) } });
  try {
    const page = await context.newPage(); await page.goto("/ops/plugins");
    await expect(page.getByRole("heading", { name: "系统插件", exact: true })).toBeVisible();
    await expect(page.getByText("已暂停：部署控制", { exact: true })).toHaveCount(4);
    await expect(page.getByText("统一暂停尚未接入", { exact: true })).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally { await context.close(); }
});
