import { expect, test } from "@playwright/test";
const base = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL;
const real = process.env.OPS_TRACKING_REAL_BACKEND === "true";
test.skip(!base, "Requires isolated multi-brand operations stack");
test.describe.configure({ mode: "serial" });
const owner = "Basic " + Buffer.from("ops_owner:" + "A".repeat(40)).toString("base64");
const reader = "Basic " + Buffer.from("fashion_reader:" + "B".repeat(40)).toString("base64");
const path = "/ops/sites/fashion-ci/tracking/api";
let target: { orderId: string; fulfillmentId: string }; let csv: string;
const trackingNumber = "CI-TRACKING-ONLY-12345";

const seedQuery = `query TrackingFixtureOrders {
  orders(first: 25, channel: "us", where: {status: {oneOf: [UNFULFILLED, PARTIALLY_FULFILLED]}}, sortBy: {field: CREATED_AT, direction: DESC}) {
    edges { node { id isPaid lines {id isShippingRequired quantityToFulfill allocations {quantity warehouse {id}}} } }
  }
}`;
const seedMutation = `mutation TrackingFixtureFulfill($id: ID!, $input: OrderFulfillInput!) {
  orderFulfill(order: $id, input: $input) { errors {code field} fulfillments {id status} }
}`;
const approveMutation = `mutation TrackingFixtureApprove($id: ID!) { orderFulfillmentApprove(id: $id, notifyCustomer: false) { errors {code field} fulfillment {id status} } }`;
const receiptQuery = `query TrackingFixtureReceipt($id: ID!) { order(id: $id) {id channel {slug} fulfillments {id status trackingNumber} } }`;

async function native<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const endpoint = process.env.SALEOR_API_URL!;
  const url = new URL(endpoint);
  // This fixture performs native stock/order mutations ONLY in isolated CI.
  if (!real || process.env.CI !== "true" || !["127.0.0.1", "localhost"].includes(url.hostname) || !process.env.OPS_FULFILLMENT_SALEOR_TOKEN) throw new Error("Tracking native fixture requires explicit loopback CI stack");
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPS_FULFILLMENT_SALEOR_TOKEN}` }, body: JSON.stringify({ query, variables }) });
  expect(response.status()).toBe(200);
  const body = await response.json() as { data: T; errors?: unknown[] }; expect(body.errors).toBeUndefined(); return body.data;
}
test.beforeAll(async ({ request }) => {
  test.setTimeout(90_000);
  if (real) {
    type Line = { id: string; isShippingRequired: boolean; quantityToFulfill: number; allocations: Array<{ quantity: number; warehouse: { id: string } }> };
    const source = await native<{ orders: { edges: Array<{ node: { id: string; isPaid: boolean; lines: Line[] } }> } }>(seedQuery);
    const paid = source.orders.edges.map(edge => edge.node).find(order => order.isPaid && order.lines.some(line => line.isShippingRequired && line.quantityToFulfill > 0 && line.allocations?.some(allocation => allocation.quantity > 0)));
    expect(paid, "Native Transactions paid allocated physical order required").toBeTruthy();
    const line = paid!.lines.find(line => line.isShippingRequired && line.quantityToFulfill > 0 && line.allocations?.some(allocation => allocation.quantity > 0))!;
    const warehouse = line.allocations.find(allocation => allocation.quantity > 0)!.warehouse.id;
    const created = await native<{ orderFulfill: { errors: unknown[]; fulfillments: Array<{ id: string; status: string }> } }>(seedMutation, { id: paid!.id, input: { lines: [{ orderLineId: line.id, stocks: [{ quantity: 1, warehouse }] }], notifyCustomer: false, allowStockToBeExceeded: false } });
    expect(created.orderFulfill.errors).toEqual([]); const fulfillment = created.orderFulfill.fulfillments[0]; expect(fulfillment).toBeTruthy();
    if (fulfillment.status === "WAITING_FOR_APPROVAL") {
      const approved = await native<{ orderFulfillmentApprove: { errors: unknown[]; fulfillment: { id: string; status: string } } }>(approveMutation, { id: fulfillment.id });
      expect(approved.orderFulfillmentApprove.errors).toEqual([]); expect(approved.orderFulfillmentApprove.fulfillment.status).toBe("FULFILLED");
    } else expect(fulfillment.status).toBe("FULFILLED");
    target = { orderId: paid!.id, fulfillmentId: fulfillment.id };
  } else {
    const response = await request.get(base + path, { headers: { authorization: owner } }); expect(response.status()).toBe(200);
    const source = await response.json(); target = source.queue.rows.find((row: { trackingNumber: string }) => !row.trackingNumber); expect(target).toBeTruthy();
  }
  csv = `order_id,fulfillment_id,tracking_number\n${target.orderId},${target.fulfillmentId},${trackingNumber}`;
});
test("preview is native read-only and protects actor, brand, market and CSRF", async ({ request }) => {
  const headers = { authorization: owner, origin: base!, "x-requested-with": "tracking-import" };
  const data = { action: "preview", channel: "us", csv };
  expect((await request.get(base + path, { headers: { authorization: reader } })).status()).toBe(403);
  expect((await request.post(base + path, { headers: { ...headers, authorization: reader }, data })).status()).toBe(403);
  expect((await request.post(base + path, { headers: { ...headers, origin: "https://foreign.example" }, data })).status()).toBe(403);
  expect((await request.post(base + path, { headers, data: { ...data, channel: "jewelry-us" } })).status()).toBe(400);
  const preview = await request.post(base + path, { headers, data }); expect(preview.status(), await preview.text()).toBe(200); expect(preview.headers()["cache-control"]).toContain("no-store");
  const inspected = await preview.json(); expect(inspected.canSubmit).toBe(true); expect(inspected.rows[0].status).toBe("ready");
  expect((await request.post(base + path, { headers, data: { ...data, action: "commit", previewId: inspected.id, confirm: false } })).status()).toBe(400);
  const queue = (await (await request.get(base + path, { headers: { authorization: owner } })).json()).queue;
  expect(queue.rows.find((row: { fulfillmentId: string }) => row.fulfillmentId === target.fulfillmentId).trackingNumber).toBe("");
});
test("administrator uploads, previews, confirms native tracking and downloads results on mobile", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ baseURL: base, httpCredentials: { username: "ops_owner", password: "A".repeat(40) } });
  try {
    const page = await context.newPage(); await page.goto("/ops/sites/fashion-ci/tracking");
    await expect(page.getByRole("heading", { name: "Fashion CI · 物流单号回填" })).toBeVisible();
    await page.getByLabel(`选择履约 ${target.fulfillmentId}`, { exact: true }).check();
    const templateDownload = page.waitForEvent("download"); await page.getByRole("button", { name: /下载所选模板/ }).click(); expect((await templateDownload).suggestedFilename()).toBe("fashion-ci-us-tracking.csv");
    await page.getByLabel("选择单号CSV", { exact: true }).setInputFiles({ name: "tracking.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "预检单号", exact: true }).click(); await expect(page.getByRole("status")).toContainText("预检通过");
    await expect(page.getByRole("button", { name: "确认回填单号", exact: true })).toBeDisabled();
    await page.getByRole("checkbox", { name: "我已核对货代与包裹对应关系，确认回填且不发送顾客邮件。", exact: true }).check();
    await page.getByRole("button", { name: "确认回填单号", exact: true }).click(); await expect(page.getByText("原生回填已确认", { exact: true })).toBeVisible();
    const results = page.waitForEvent("download"); await page.getByRole("button", { name: "下载逐笔结果", exact: true }).click(); expect((await results).suggestedFilename()).toBe("fashion-ci-tracking-results.csv");
    await page.reload(); await expect(page.getByText(/ops_owner · 已确认/).first()).toBeVisible(); await expect(page.getByText(`已有单号：${trackingNumber}`, { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally { await context.close(); }
});
test("native receipt, scoped history and identical replay confirm without creating another fulfillment", async ({ request }) => {
  const headers = { authorization: owner, origin: base!, "x-requested-with": "tracking-import" };
  const snapshot = await (await request.get(base + path, { headers })).json();
  expect(snapshot.history.filter((row: { fulfillmentId: string }) => row.fulfillmentId === target.fulfillmentId)).toHaveLength(1); expect(JSON.stringify(snapshot.history)).not.toContain(trackingNumber);
  const data = { action: "preview", channel: "us", csv }; const preview = await (await request.post(base + path, { headers, data })).json(); expect(preview.rows[0].status).toBe("already_applied");
  const repeated = await request.post(base + path, { headers, data: { ...data, action: "commit", previewId: preview.id, confirm: true } }); expect(repeated.status()).toBe(200); expect((await repeated.json()).rows[0].status).toBe("already_applied");
  expect((await (await request.get(base + path + "?channel=us", { headers })).json()).history.filter((row: { fulfillmentId: string }) => row.fulfillmentId === target.fulfillmentId)).toHaveLength(1);
  const foreign = await request.get(base + "/ops/sites/jewelry-ci/tracking/api", { headers }); expect(foreign.status()).toBe(200); expect(JSON.stringify(await foreign.json())).not.toContain(target.fulfillmentId);
  if (real) {
    const nativeOrder = await native<{ order: { channel: { slug: string }; fulfillments: Array<{ id: string; status: string; trackingNumber: string }> } }>(receiptQuery, { id: target.orderId });
    expect(nativeOrder.order.channel.slug).toBe("us"); expect(nativeOrder.order.fulfillments.filter(item => item.id === target.fulfillmentId)).toEqual([{ id: target.fulfillmentId, status: "FULFILLED", trackingNumber }]);
  }
});
