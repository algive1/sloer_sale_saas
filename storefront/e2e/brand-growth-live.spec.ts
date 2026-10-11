import { expect, test, type APIRequestContext } from "@playwright/test";
const base = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL;
const sqlURL = process.env.OPS_E2E_HRANA_URL;
const sqlToken = process.env.OPS_E2E_HRANA_TOKEN;
test.skip(!base || !sqlURL || !sqlToken, "Requires isolated multibrand stack and CI-only SQLite fixture");
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");
async function execute(request: APIRequestContext, sql: string, args: Array<string | number> = []) {
  const response = await request.post(sqlURL + "/v3/pipeline", { headers: { authorization: "Bearer " + sqlToken }, data: {
    requests: [{ type: "execute", stmt: { sql, args: args.map(v => typeof v === "number" ? { type: "integer", value: String(v) } : { type: "text", value: v }), want_rows: false } }, { type: "close" }],
  } });
  expect(response.status()).toBe(200); const payload = await response.json(); expect(payload.results[0].type).toBe("ok");
}

test("realtime API reauthorizes readers and never trusts client channel or role", async ({ request }) => {
  const path = base + "/ops/sites/fashion-ci/realtime/api?channel=jewelry-us";
  const own = await request.get(path, { headers: { authorization: reader, "x-ops-role": "platform_admin" } });
  expect(own.status()).toBe(200); expect(own.headers()["cache-control"]).toContain("no-store");
  for (const url of ["/ops/sites/jewelry-ci/realtime/api", "/ops/api/analytics/realtime", "/ops/analytics/destinations"]) {
    expect((await request.get(base + url, { headers: { authorization: reader, "x-ops-role": "platform_admin" } })).status()).toBe(403);
  }
  expect((await request.post(path, { headers: { authorization: reader } })).status()).toBe(403);
  for (const [id, channel] of [["OWN-LIVE-CI", "us"], ["FOREIGN-LIVE-CI", "jewelry-us"]]) {
    await execute(request, "INSERT OR REPLACE INTO analytics_events(id,occurred_at,event_name,channel,event_id,session_id,transaction_id,value,currency,country_code,device_type,payload_json) VALUES (?,?,'checkout_completed',?,?,?,?,10,'USD','US','desktop','{}')", [id, new Date().toISOString(), channel, id, id, id]);
    await execute(request, "INSERT OR REPLACE INTO analytics_event_items(event_name,event_id,item_index,item_id,item_name,quantity) VALUES ('checkout_completed',?,0,?,?,1)", [id, id, id]);
  }
  const scoped = JSON.stringify(await (await request.get(path, { headers: { authorization: reader } })).json());
  expect(scoped).toContain("OWN-LIVE-CI"); expect(scoped).not.toContain("FOREIGN-LIVE-CI");
});

test("brand realtime browser keeps its scope during automatic refresh", async ({ browser }) => {
  test.setTimeout(60_000); // Includes one actual 10s polling interval and local first compilation.
  const context = await browser.newContext({ baseURL: base, httpCredentials: { username: "fashion_reader", password: "B".repeat(40) } });
  try {
    const page = await context.newPage(); await page.goto("/ops/sites/fashion-ci/realtime");
    await expect(page.getByRole("heading", { name: "实时数据", exact: true })).toBeVisible();
    await expect(page.getByText(/范围：Fashion CI/)).toBeVisible();
    await expect(page.getByText("OWN-LIVE-CI", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("FOREIGN-LIVE-CI", { exact: true })).toHaveCount(0);
    const refresh = await page.waitForResponse(r => r.url().includes("/ops/sites/fashion-ci/realtime/api"), { timeout: 18000 });
    expect(refresh.status()).toBe(200); expect(JSON.stringify(await refresh.json())).not.toContain("FOREIGN-LIVE-CI");
    await page.getByRole("button", { name: "暂停", exact: true }).click(); await expect(page.getByRole("button", { name: "继续", exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test("advertising diagnostics show persisted brand receipts without credentials or foreign rows", async ({ browser, request }) => {
  expect((await request.get(base + "/ops/analytics/destinations", { headers: { authorization: owner } })).status()).toBe(200);
  for (const [id, site] of [["OWN-ADS-CI", "fashion-ci"], ["FOREIGN-ADS-CI", "jewelry-ci"]]) {
    await execute(request, "INSERT OR REPLACE INTO analytics_ad_deliveries(site_id,destination,event_key,destination_id,event_name,channel,status,code,claimed_at) VALUES (?,'ga4',?,'G-CIONLY',?,'us','transport_accepted','http_2xx_not_processing_proof',?)", [site, id, id, new Date().toISOString()]);
  }
  const context = await browser.newContext({ baseURL: base, httpCredentials: { username: "ops_owner", password: "A".repeat(40) } });
  try {
    const page = await context.newPage(); await page.goto("/ops/analytics/destinations?siteId=fashion-ci");
    await expect(page.getByRole("heading", { name: "Fashion CI · 服务端接收账户" })).toBeVisible();
    await expect(page.getByText(/OWN-ADS-CI/)).toBeVisible(); await expect(page.getByText(/FOREIGN-ADS-CI/)).toHaveCount(0);
    await expect(page.getByText("HTTP 已接收 · 未证明入报表", { exact: true })).toBeVisible();
    await page.getByLabel("品牌", { exact: true }).selectOption("jewelry-ci"); await page.getByRole("button", { name: "查看账户" }).click();
    await expect(page.getByText(/FOREIGN-ADS-CI/)).toBeVisible(); await expect(page.getByText(/OWN-ADS-CI/)).toHaveCount(0);
    await page.reload(); await expect(page.getByText(/FOREIGN-ADS-CI/)).toBeVisible();
  } finally { await context.close(); }
});
