import { expect, test } from "@playwright/test";

const base = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL;
test.skip(!base, "Requires multi-brand operations stack");
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");
const path = "/ops/sites/fashion-ci/readiness/api";

test("readiness API scopes readers, records ownership and refuses stale/cross-site writes", async ({ request }) => {
  const start = await request.get(base + path, { headers: { authorization: owner } });
  expect(start.status()).toBe(200);
  expect(start.headers()["cache-control"]).toContain("no-store");
  const { snapshot } = await start.json();
  expect(snapshot.canLaunch).toBe(false);
  const check = snapshot.checks.find((row: { id: string }) => row.id === "payment:us");
  const input = { checkId: check.id, contextHash: snapshot.contextHash, expectedRevision: check.record?.revision ?? 0,
    result: "passed", environment: "test", evidence: "CI-only TEST-RDY-001 mock acceptance; no real customer payment or email.", verifiedBy: "forged_operator" };
  const headers = { authorization: owner, origin: base!, "x-requested-with": "readiness" };
  expect((await request.post(base + path, { headers: { ...headers, origin: "https://attacker.example" }, data: input })).status()).toBe(403);
  expect((await request.post(base + path, { headers: { ...headers, authorization: reader }, data: input })).status()).toBe(403);
  expect((await request.get(base + "/ops/sites/jewelry-ci/readiness/api", { headers: { authorization: reader } })).status()).toBe(403);
  const saved = await request.post(base + path, { headers, data: input });
  expect(saved.status()).toBe(200);
  const updated = (await saved.json()).snapshot;
  const record = updated.checks.find((row: { id: string }) => row.id === check.id).record;
  expect(record.verifiedBy).toBe("ops_owner");
  expect(record.environment).toBe("test");
  expect(updated.canLaunch).toBe(false);
  expect((await request.post(base + path, { headers, data: input })).status()).toBe(409);
  const own = await request.get(base + path, { headers: { authorization: reader } });
  expect(own.status()).toBe(200);
  expect((await own.json()).snapshot.siteId).toBe("fashion-ci");
});

test("operator saves evidence in the browser and sees the persistent record after refresh", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: base, httpCredentials: { username: "ops_owner", password: "A".repeat(40) } });
  try {
    const page = await context.newPage();
    await page.goto("/ops/sites/fashion-ci/readiness");
    await expect(page.getByRole("heading", { name: "Fashion CI · 上线前检查" })).toBeVisible();
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: /政策与联系方式/ }) });
    await card.getByRole("button", { name: "记录本次验收" }).click();
    await card.getByLabel(/证据与失败原因/).fill("CI-only POLICY-001: policy page verification placeholder, test environment only.");
    await card.getByLabel("验收结果").selectOption("passed");
    await card.getByRole("button", { name: "保存验收记录" }).click();
    await expect(page.getByRole("status")).toContainText("验收记录已保存");
    await page.reload();
    await expect(card).toContainText("POLICY-001");
    await expect(card).toContainText("ops_owner");
    await expect(page.getByRole("heading", { name: "当前状态：待上线验收" })).toBeVisible();
  } finally { await context.close(); }
});
