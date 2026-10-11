import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FulfillmentStatus, OrderStatus, type OpsTrackingOrderFragment } from "@/gql/graphql";
const state = vi.hoisted(() => ({ db: null as DatabaseSync | null, configured: true, writable: true, failFinish: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/libsql-http", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/storage/libsql-http")>();
  return { ...original, analyticsDatabaseConfigured: () => state.configured,
    libsqlPipeline: vi.fn(async (statements: Array<{ sql: string; args?: Array<string | number | null>; wantRows?: boolean }>) => {
      if (!state.writable || (state.failFinish && statements.some(statement => statement.sql.startsWith("UPDATE ops_tracking_attempts")))) throw new Error("private database failure");
      return statements.map(statement => {
        const query = state.db!.prepare(statement.sql);
        if (!statement.wantRows) return { cols: [], rows: [], affected_row_count: Number(query.run(...statement.args ?? []).changes) };
        const names = query.columns().map(column => column.name);
        return { cols: names.map(name => ({ name })), rows: query.all(...statement.args ?? []).map(row => names.map(name => row[name] === null ? { type: "null" } : typeof row[name] === "number" ? { type: "float", value: row[name] } : { type: "text", value: String(row[name]) })) };
      });
    }) };
});
import { commitTrackingCsv, previewTrackingCsv, readTrackingQueue, trackingHistory } from "./tracking";
import { parseTrackingCsv } from "./tracking-csv";
const admin = { username: "ops_owner", role: "platform_admin" as const, siteIds: [] };
const analyst = { username: "reader", role: "brand_analyst" as const, siteIds: ["fashion"] };
const id = (type: string, value = "1") => btoa(`${type}:${value}`);
const csv = (number = "TEST123", value = "1") => `order_id,fulfillment_id,tracking_number\n${id("Order", value)},${id("Fulfillment", value)},${number}`;
const order = (value = "1"): OpsTrackingOrderFragment => ({ id: id("Order", value), number: value, status: OrderStatus.Fulfilled, isPaid: true, isShippingRequired: true, channel: { slug: "us" }, fulfillments: [{ id: id("Fulfillment", value), status: FulfillmentStatus.Fulfilled, trackingNumber: "", lines: [{ quantity: 1, orderLine: { isShippingRequired: true } }] }] });
function native(orders = [order()], mode: "normal" | "lost" | "reject" | "wrong" = "normal") {
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const input = JSON.parse(String(init?.body)) as { query: string; variables: { channel: string; ids?: string[]; id?: string; trackingNumber?: string } };
    if (!input.query.includes("mutation OpsUpdateTracking")) return Response.json({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges: orders.filter(order => !input.variables.ids || input.variables.ids.includes(order.id)).map(node => ({ node })) } } });
    if (mode === "reject") return Response.json({ data: { orderFulfillmentUpdateTracking: { errors: [{ field: "id", code: "NOT_FOUND" }], fulfillment: null, order: null } } });
    const target = orders.find(order => order.fulfillments?.some(item => item.id === input.variables.id))!;
    const fulfillment = target.fulfillments!.find(item => item.id === input.variables.id)!;
    fulfillment.trackingNumber = input.variables.trackingNumber!;
    if (mode === "lost") throw new Error("lost acknowledgement private provider content");
    return Response.json({ data: { orderFulfillmentUpdateTracking: { errors: [], fulfillment: { id: mode === "wrong" ? "foreign" : fulfillment.id, status: fulfillment.status, trackingNumber: fulfillment.trackingNumber }, order: { id: target.id, channel: target.channel } } } });
  });
  vi.stubGlobal("fetch", fetcher); return { orders, fetcher, mutations: () => fetcher.mock.calls.filter(call => String(call[1]?.body).includes("mutation OpsUpdateTracking")) };
}
beforeEach(() => {
  state.db = new DatabaseSync(":memory:"); state.configured = state.writable = true; state.failFinish = false;
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([{ id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["us", "eu"], defaultChannel: "us" }, { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" }]));
  vi.stubEnv("SALEOR_INTERNAL_API_URL", "http://native.example/graphql/"); vi.stubEnv("OPS_FULFILLMENT_SALEOR_TOKEN", "private-dedicated-token");
});
afterEach(() => { state.db?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("bounds CSV, requires exact native IDs, and rejects formulas, duplicate fulfillments and tracking URLs", () => {
  expect(parseTrackingCsv("\uFEFF" + csv())).toMatchObject([{ row: 2, trackingNumber: "TEST123" }]);
  for (const input of ["bad", csv("=formula"), csv("https://carrier.test/1"), csv("TEST\n1"), csv().replace(id("Fulfillment"), id("Order")), csv() + "\n" + csv().split("\n")[1], "x".repeat(64_001), csv("TEST") + "\n" + Array.from({ length: 10 }, (_, i) => `${id("Order", String(i+2))},${id("Fulfillment", String(i+2))},TEST`).join("\n")]) expect(() => parseTrackingCsv(input)).toThrow("invalid_tracking_csv");
});
it("denies shared admin/analyst and foreign brand/market before any I/O; no fallback credential", async () => {
  const source = native();
  for (const viewer of [null, analyst, { ...admin, username: "analytics" }]) await expect(previewTrackingCsv("fashion", viewer, "us", csv())).rejects.toThrow("individual_admin");
  await expect(previewTrackingCsv("fashion", admin, "jewelry-us", csv())).rejects.toThrow("invalid_fulfillment_market");
  vi.stubEnv("OPS_FULFILLMENT_SALEOR_TOKEN", ""); vi.stubEnv("SALEOR_APP_TOKEN", "global-must-not-be-used");
  await expect(previewTrackingCsv("fashion", admin, "us", csv())).rejects.toThrow("credential"); expect(source.fetcher).not.toHaveBeenCalled();
});
it("requires writable audit before native mutation and keeps previews read-only at Core", async () => {
  const source = native(); state.configured = false;
  await expect(previewTrackingCsv("fashion", admin, "us", csv())).rejects.toThrow("audit_required"); expect(source.fetcher).not.toHaveBeenCalled();
  state.configured = true; state.writable = false;
  await expect(previewTrackingCsv("fashion", admin, "us", csv())).rejects.toThrow("database failure"); expect(source.mutations()).toHaveLength(0);
});
it("returns exact minimal queue data and rejects foreign upstream responses", async () => {
  const source = native(); const queue = await readTrackingQueue("fashion", admin);
  expect(queue.rows).toHaveLength(1); expect(JSON.stringify(queue)).not.toMatch(/orderLine|private-dedicated|shippingAddress|email/);
  source.orders[0].channel.slug = "jewelry-us"; await expect(readTrackingQueue("fashion", admin)).rejects.toThrow("scope_mismatch");
  await expect(previewTrackingCsv("fashion", admin, "us", csv())).rejects.toThrow("scope_mismatch");
});
it("previews payment/status/physical/ownership conflicts and refuses the whole batch before writes", async () => {
  const source = native();
  for (const patch of [{ isPaid: false }, { status: OrderStatus.Canceled }, { isShippingRequired: false }]) {
    Object.assign(source.orders[0], order(), patch);
    const preview = await previewTrackingCsv("fashion", admin, "us", csv()); expect(preview.canSubmit).toBe(false); expect(preview.rows[0].status).toBe("ineligible");
    await expect(commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rejects.toThrow("changed_reload");
  }
  source.orders[0] = order(); source.orders[0].fulfillments![0].status = FulfillmentStatus.Canceled;
  expect((await previewTrackingCsv("fashion", admin, "us", csv())).rows[0].status).toBe("ineligible");
  source.orders[0] = order(); source.orders[0].fulfillments![0].lines![0].orderLine = null;
  expect((await previewTrackingCsv("fashion", admin, "us", csv())).rows[0].status).toBe("ineligible");
  expect((await previewTrackingCsv("fashion", admin, "us", csv("TEST", "99"))).rows[0].status).toBe("missing");
  source.orders[0] = order(); source.orders[0].fulfillments![0].trackingNumber = "OTHER";
  expect((await previewTrackingCsv("fashion", admin, "us", csv())).rows[0].status).toBe("conflict"); expect(source.mutations()).toHaveLength(0);
});
it("binds expiring previews to individual actor, brand, market and exact CSV", async () => {
  const source = native(); const preview = await previewTrackingCsv("fashion", admin, "us", csv());
  for (const [site, actor, channel, input] of [["fashion", { ...admin, username: "other_owner" }, "us", csv()], ["jewelry", admin, "jewelry-us", csv()], ["fashion", admin, "eu", csv()], ["fashion", admin, "us", csv("CHANGED")]] as const) await expect(commitTrackingCsv(site, actor, channel, input, preview.id)).rejects.toThrow("expired_or_changed");
  state.db!.prepare("UPDATE ops_tracking_previews SET expires_at='2000-01-01T00:00:00Z'").run();
  await expect(commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rejects.toThrow("expired_or_changed"); expect(source.mutations()).toHaveLength(0);
});
it("confirms native receipts and writes scoped audit without CSV or cleartext tracking", async () => {
  const source = native(); const preview = await previewTrackingCsv("fashion", admin, "us", csv());
  const result = await commitTrackingCsv("fashion", admin, "us", csv(), preview.id); expect(result.rows[0].status).toBe("applied"); expect(source.mutations()).toHaveLength(1);
  const input = JSON.parse(String(source.mutations()[0][1]?.body)) as { variables: unknown; query: string }; expect(input.variables).toEqual({ id: id("Fulfillment"), trackingNumber: "TEST123" }); expect(input.query).toContain("notifyCustomer: false");
  const audit = await trackingHistory("fashion", admin); expect(audit?.[0]).toMatchObject({ actor: "ops_owner", state: "applied" });
  expect(await trackingHistory("fashion", admin, "eu")).toEqual([]); expect(await trackingHistory("jewelry", admin)).toEqual([]);
  expect(JSON.stringify(state.db!.prepare("SELECT * FROM ops_tracking_attempts").all())).not.toContain("TEST123");
  expect(JSON.stringify(state.db!.prepare("SELECT * FROM ops_tracking_previews").all())).not.toContain("TEST123");
});
it("atomically suppresses double submissions and reconciles a matching native number without another mutation", async () => {
  const source = native(); const preview = await previewTrackingCsv("fashion", admin, "us", csv());
  await Promise.all([commitTrackingCsv("fashion", admin, "us", csv(), preview.id), commitTrackingCsv("fashion", admin, "us", csv(), preview.id)]);
  expect(source.mutations()).toHaveLength(1); expect(state.db!.prepare("SELECT * FROM ops_tracking_attempts").all()).toHaveLength(1);
  const fresh = await previewTrackingCsv("fashion", admin, "us", csv()); expect(fresh.rows[0].status).toBe("already_applied");
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), fresh.id)).rows[0].status).toBe("already_applied"); expect(source.mutations()).toHaveLength(1);
});
it("lost acknowledgement remains uncertain and fresh native reconciliation never resends", async () => {
  const source = native([order()], "lost"); const preview = await previewTrackingCsv("fashion", admin, "us", csv());
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rows[0].status).toBe("uncertain");
  expect((await trackingHistory("fashion", admin))?.[0].state).toBe("uncertain");
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rows[0].status).toBe("already_applied"); expect(source.mutations()).toHaveLength(1);
  expect((await trackingHistory("fashion", admin))?.[0].state).toBe("applied");
});
it("uncertain blank native result and different active targets cannot be retried automatically", async () => {
  const source = native([order()], "lost"); const preview = await previewTrackingCsv("fashion", admin, "us", csv());
  await commitTrackingCsv("fashion", admin, "us", csv(), preview.id); source.orders[0].fulfillments![0].trackingNumber = "";
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rows[0].status).toBe("uncertain");
  const changed = await previewTrackingCsv("fashion", admin, "us", csv("OTHER"));
  expect((await commitTrackingCsv("fashion", admin, "us", csv("OTHER"), changed.id)).rows[0].status).toBe("conflict"); expect(source.mutations()).toHaveLength(1);
});
it("lost audit after native commit preserves sending claim and can reconcile safely", async () => {
  const source = native(); const preview = await previewTrackingCsv("fashion", admin, "us", csv()); state.failFinish = true;
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rows[0].status).toBe("uncertain");
  expect(state.db!.prepare("SELECT state FROM ops_tracking_attempts").get()?.state).toBe("sending");
  state.failFinish = false;
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rows[0].status).toBe("already_applied"); expect(source.mutations()).toHaveLength(1);
});
it("keeps explicit native rejection in audit, allows a new approved attempt, and treats malformed receipt as uncertain", async () => {
  const source = native([order()], "reject"); const preview = await previewTrackingCsv("fashion", admin, "us", csv());
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), preview.id)).rows[0].status).toBe("rejected"); expect(source.mutations()).toHaveLength(1);
  const normal = native(); const fresh = await previewTrackingCsv("fashion", admin, "us", csv());
  expect((await commitTrackingCsv("fashion", admin, "us", csv(), fresh.id)).rows[0].status).toBe("applied"); expect(normal.mutations()).toHaveLength(1); expect(await trackingHistory("fashion", admin)).toHaveLength(2);
  const wrong = native([order("2")], "wrong"); const next = await previewTrackingCsv("fashion", admin, "us", csv("TEST", "2"));
  expect((await commitTrackingCsv("fashion", admin, "us", csv("TEST", "2"), next.id)).rows[0].status).toBe("uncertain"); expect(wrong.mutations()).toHaveLength(1);
});
it("rejects an invalid batch before any native writes and reports a later native change as partial completion", async () => {
  const source = native([order(), order("2")]);
  const batch = csv() + "\n" + csv("SECOND", "2").split("\n")[1];
  const preview = await previewTrackingCsv("fashion", admin, "us", batch);
  source.orders[1].isPaid = false;
  await expect(commitTrackingCsv("fashion", admin, "us", batch, preview.id)).rejects.toThrow("changed_reload"); expect(source.mutations()).toHaveLength(0);
  source.orders[1].isPaid = true;
  const original = source.fetcher.getMockImplementation()!;
  const changed = vi.fn<typeof fetch>(async (...args) => { const response = await original(...args); if (String(args[1]?.body).includes("mutation OpsUpdateTracking")) source.orders[1].isPaid = false; return response; }); vi.stubGlobal("fetch", changed);
  const result = await commitTrackingCsv("fashion", admin, "us", batch, preview.id);
  expect(result.rows.map(row => row.status)).toEqual(["applied", "rejected"]); expect(changed.mock.calls.filter(call => String(call[1]?.body).includes("mutation OpsUpdateTracking"))).toHaveLength(1);
  expect((await trackingHistory("fashion", admin))?.map(row => row.state).sort()).toEqual(["applied", "rejected"]);
});
it("stops the batch after an uncertain receipt and leaves untouched rows explicitly unattempted", async () => {
  const source = native([order(), order("2")], "lost");
  const batch = csv() + "\n" + csv("SECOND", "2").split("\n")[1]; const preview = await previewTrackingCsv("fashion", admin, "us", batch);
  const result = await commitTrackingCsv("fashion", admin, "us", batch, preview.id);
  expect(result.rows.map(row => row.status)).toEqual(["uncertain", "rejected"]); expect(result.rows[1].reason).toBe("batch_stopped_before_attempt"); expect(source.mutations()).toHaveLength(1);
  expect(source.orders[1].fulfillments![0].trackingNumber).toBe("");
});
