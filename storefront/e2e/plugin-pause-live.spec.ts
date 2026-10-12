import { createServer, request as forwardRequest } from "node:http";
import { expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_PLUGIN_PAUSE_BASE_URL;
test.skip(!base, "Requires a storefront process with all seven optional modules paused after build");
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
  expect(html).toContain("已暂停：部署控制"); expect(html).not.toContain("统一暂停尚未接入");
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
  expect(response.status()).toBe(200); const html=await response.text(); expect(html).not.toContain("support.chatwoot.com"); expect(html).not.toContain("https://wa.me/"); expect(html).not.toContain("https://support.example.test");
});

test("plugin status clearly separates all seven paused modules and core SEO on mobile", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 812 }, httpCredentials: { username: "ops_owner", password: "A".repeat(40) } });
  try {
    const page = await context.newPage(); await page.goto("/ops/plugins");
    await expect(page.getByRole("heading", { name: "系统插件", exact: true })).toBeVisible();
    await expect(page.getByText("已暂停：部署控制", { exact: true })).toHaveCount(7);
    await expect(page.getByText("统一暂停尚未接入", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally { await context.close(); }
});


test("paused collection drops browser events and disables feed while signed webhook authentication remains", async ({ request }) => {
  const events = await request.post(base + "/api/analytics/events", { data: "not-json" });
  expect(events.status()).toBe(204); expect(events.headers()["cache-control"]).toContain("no-store");
  expect((await request.post(base + "/api/analytics/saleor-order-events", { data: {} })).status()).toBe(401);
  const feed = await request.get(base + "/merchant/google.xml?channel=us", { headers: { host: "fashion.example.test" } });
  expect(feed.status()).toBe(503); expect(feed.headers()["cache-control"]).toContain("no-store");
  expect(await feed.text()).toContain("plugin_paused");
});

test("feed pause retains native product SEO and omits optional advertising scripts", async ({ request }) => {
  test.skip(process.env.OPS_PLUGIN_REAL_BACKEND !== "true", "Native HTML acceptance runs in CI");
  const product = await request.get(base + "/en/us/products/cubes-fountain-tee", { headers: { host: "fashion.example.test" } });
  expect(product.status()).toBe(200); const html = await product.text();
  expect(html).toContain("application/ld+json");
  expect(html).not.toMatch(/www\.googletagmanager\.com|connect\.facebook\.net|analytics\.tiktok\.com/);
});


test("hydrated checkout root never stores attribution or sends tracking while both destinations are paused", async ({ browser }) => {
  test.setTimeout(60_000);
  const target = new URL(base!);
  expect(target.protocol).toBe("http:"); expect(["localhost", "127.0.0.1"]).toContain(target.hostname);
  // A real local reverse proxy supplies the trusted brand Host; no browser spoofing or bypass.
  const proxy = createServer((incoming, outgoing) => {
    const upstream = forwardRequest({ hostname: target.hostname, port: target.port, method: incoming.method, path: incoming.url,
      headers: { ...incoming.headers, host: "fashion.example.test" } }, response => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing);
      });
    upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    incoming.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address(); if (!address || typeof address === "string") throw new Error("proxy address unavailable");
  const origin = "http://127.0.0.1:" + address.port;
  const context = await browser.newContext({ baseURL: origin });
  try {
    await context.addCookies([{ name: "paper_analytics_consent", value: "granted", url: origin }]);
    const page = await context.newPage(); const sent: string[] = [];
    page.on("request", request => { if (/api\/analytics\/events|_vercel\/insights|googletagmanager|connect\.facebook|analytics\.tiktok/.test(request.url())) sent.push(request.url()); });
    await page.goto("/checkout");
    await expect.poll(() => page.evaluate(() => typeof window.paperAnalytics?.getConsent)).toBe("function");
    await page.evaluate(() => window.paperAnalytics?.setConsent("granted"));
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/paper_analytics_(landing|sid)=/);
    expect(await page.evaluate(() => sessionStorage.getItem("paper.analytics.landing.pending"))).toBeNull();
    await expect(page.getByRole("dialog", { name: "Analytics and advertising preferences" })).toHaveCount(0);
    expect(sent).toEqual([]);
  } finally { await context.close(); proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); }
});
