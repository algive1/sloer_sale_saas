import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderStatus, WeightUnitsEnum, type OpsShippingExportOrdersQuery } from "@/gql/graphql";
const state = vi.hoisted(() => ({ db: null as DatabaseSync | null, configured: true, writable: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/libsql-http", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/storage/libsql-http")>();
  return { ...original, analyticsDatabaseConfigured: () => state.configured,
    libsqlPipeline: vi.fn(async (statements: Array<{ sql: string; args?: Array<string | number | null>; wantRows?: boolean }>) => {
      if (!state.writable) throw new Error("audit unavailable");
      return statements.map(statement => {
        const query = state.db!.prepare(statement.sql);
        if (!statement.wantRows) return { cols: [], rows: [], affected_row_count: Number(query.run(...statement.args ?? []).changes) };
        const names = query.columns().map(column => column.name);
        return { cols: names.map(name => ({ name })), rows: query.all(...statement.args ?? []).map(row => names.map(name =>
          typeof row[name] === "number" ? { type: "float", value: row[name] } : { type: "text", value: String(row[name]) })) };
      });
    }) };
});
import { exportShippingCsv, publicFulfillmentOrder, readFulfillmentSnapshot, shippingEligible, shippingExportHistory } from "./fulfillment";
type Order = NonNullable<OpsShippingExportOrdersQuery["orders"]>["edges"][number]["node"];
const admin = { username: "ops_owner", role: "platform_admin" as const, siteIds: [] };
const analyst = { username: "reader", role: "brand_analyst" as const, siteIds: ["fashion"] };
const order = (): Order => ({ id: "T3JkZXI6MQ==", number: "101", created: "2026-10-11T01:00:00Z", status: OrderStatus.PartiallyFulfilled, isPaid: true,
  isShippingRequired: true, channel: { slug: "us" }, weight: { value: 0.4, unit: WeightUnitsEnum.Kg },
  shippingAddress: { firstName: "=Danger", lastName: "Recipient", companyName: "Test", streetAddress1: "123 Fixture Street", streetAddress2: "", city: "Test City", cityArea: "", countryArea: "CA", postalCode: "90001", country: { code: "US" }, phone: "+15551234567" },
  lines: [{ id: "line1", productSku: "HAT", productName: "Hat", quantity: 3, quantityFulfilled: 1, quantityToFulfill: 2, isShippingRequired: true }, { id: "line2", productSku: "PDF", productName: "Digital", quantity: 1, quantityFulfilled: 0, quantityToFulfill: 1, isShippingRequired: false }], fulfillments: [] });
function source(orders = [order()]) {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges: orders.map(node => ({ node })) } } }));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
beforeEach(() => {
  state.db = new DatabaseSync(":memory:"); state.configured = state.writable = true;
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify([{ id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["us", "eu"], defaultChannel: "us" }, { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" }]));
  vi.stubEnv("SALEOR_INTERNAL_API_URL", "http://native.example/graphql/"); vi.stubEnv("OPS_FULFILLMENT_SALEOR_TOKEN", "private-fixture-only");
});
afterEach(() => { state.db?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("authorizes brand and market before querying and excludes recipient data from readers", async () => {
  const fetcher = source(); await expect(readFulfillmentSnapshot("jewelry", analyst)).rejects.toThrow("forbidden");
  await expect(readFulfillmentSnapshot("fashion", analyst, "jewelry-us")).rejects.toThrow("invalid"); expect(fetcher).not.toHaveBeenCalled();
  const snapshot = await readFulfillmentSnapshot("fashion", analyst); const serialized = JSON.stringify(snapshot);
  expect(serialized).not.toMatch(/Fixture Street|Recipient|15551234567|shippingAddress|private-fixture/);
  const query = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as { variables: { channel: string }; query: string }; expect(query.variables.channel).toBe("us"); expect(query.query).not.toContain("firstName");
  expect(snapshot.orders[0].lines[0].quantityToFulfill).toBe(2); expect(snapshot.orders[0].exportable).toBe(true);
});
it("rejects foreign upstream results and partial errors instead of an empty success", async () => {
  const foreign = order(); foreign.channel.slug = "jewelry-us"; source([foreign]);
  await expect(readFulfillmentSnapshot("fashion", analyst)).rejects.toThrow("scope_mismatch");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { orders: null }, errors: [{ message: "secret upstream error" }] })));
  await expect(readFulfillmentSnapshot("fashion", analyst)).rejects.toThrow("source_unavailable");
});
it("uses current paid state for Transactions API orders and rejects unpaid, digital or completed orders", () => {
  const paid = order(); expect(shippingEligible(paid)).toBe(true);
  for (const patch of [{ isPaid: false }, { isShippingRequired: false }, { shippingAddress: null }, { status: OrderStatus.Fulfilled }, { lines: [] }]) expect(shippingEligible({ ...paid, ...patch })).toBe(false);
  expect(publicFulfillmentOrder(paid, "us").channel).toBe("us");
});
it("exports only remaining physical lines, escapes formulas and writes a PII-free audit", async () => {
  const fetcher = source(); const result = await exportShippingCsv("fashion", admin, "us", [order().id]);
  expect(result.rows).toBe(1); expect(result.csv).toContain('"HAT","Hat","2","0.4","KG"'); expect(result.csv).not.toContain('"PDF"'); expect(result.csv).toContain("'=Danger Recipient"); expect(result.csv).toContain("'+15551234567");
  const audit = state.db!.prepare("SELECT * FROM ops_shipping_exports").all(); expect(audit).toHaveLength(1);
  expect(audit[0].actor).toBe("ops_owner"); expect(audit[0].order_ids_digest).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(audit)).not.toMatch(/Fixture Street|Recipient|15551234567|T3Jk/);
  const input = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as { variables: unknown }; expect(input.variables).toEqual({ channel: "us", ids: [order().id] });
  expect(await shippingExportHistory("fashion", admin)).toHaveLength(1); expect(await shippingExportHistory("fashion", admin, "eu")).toEqual([]); expect(await shippingExportHistory("jewelry", admin)).toEqual([]);
});
it("initializes empty audit history and requires an individual administrator plus writable storage", async () => {
  expect(await shippingExportHistory("fashion", admin)).toEqual([]); const fetcher = source();
  for (const viewer of [null, analyst, { ...admin, username: "analytics" }]) await expect(exportShippingCsv("fashion", viewer, "us", [order().id])).rejects.toThrow("individual_admin");
  state.configured = false; await expect(exportShippingCsv("fashion", admin, "us", [order().id])).rejects.toThrow("audit_storage"); expect(fetcher).not.toHaveBeenCalled();
  state.configured = true; state.writable = false; await expect(exportShippingCsv("fashion", admin, "us", [order().id])).rejects.toThrow("audit unavailable");
});
it("rejects invalid selections before IO and rechecks changed unpaid, foreign or missing orders", async () => {
  const fetcher = source(); for (const ids of [[], [order().id, order().id], ["bad!"], Array.from({ length: 26 }, (_, i) => String(i))]) await expect(exportShippingCsv("fashion", admin, "us", ids)).rejects.toThrow("invalid_export_selection");
  expect(fetcher).not.toHaveBeenCalled();
  for (const orders of [[], [{ ...order(), isPaid: false }], [{ ...order(), channel: { slug: "jewelry-us" } }]]) { source(orders); await expect(exportShippingCsv("fashion", admin, "us", [order().id])).rejects.toThrow("changed_reload"); }
  expect(await shippingExportHistory("fashion", admin)).toEqual([]);
});
it("rejects duplicate upstream IDs, incomplete addresses and overlarge batches without an audit success", async () => {
  source([order(), order()]); await expect(exportShippingCsv("fashion", admin, "us", [order().id,"other"])).rejects.toThrow("changed_reload");
  const incomplete = order(); incomplete.shippingAddress!.city = ""; source([incomplete]); await expect(exportShippingCsv("fashion", admin, "us", [incomplete.id])).rejects.toThrow("address_incomplete");
  const missingSku = order(); missingSku.lines[0].productSku = null; source([missingSku]); await expect(exportShippingCsv("fashion", admin, "us", [missingSku.id])).rejects.toThrow("sku_incomplete");
  const huge = order(); huge.lines = Array.from({ length: 501 }, (_, i) => ({ ...huge.lines[0], id: String(i) })); source([huge]); await expect(exportShippingCsv("fashion", admin, "us", [huge.id])).rejects.toThrow("too_many_lines");
  expect(await shippingExportHistory("fashion", admin)).toEqual([]);
});

it("marks physical missing-SKU orders as not exportable while preserving native fulfillment access", () => {
  const incomplete = order(); incomplete.lines[0].productSku = null;
  expect(publicFulfillmentOrder(incomplete, "us")).toMatchObject({ shippingReady: true, exportable: false });
  incomplete.lines[0].productSku = "   "; expect(publicFulfillmentOrder(incomplete, "us").exportable).toBe(false);
  incomplete.lines[0].productSku = "HAT"; expect(publicFulfillmentOrder(incomplete, "us").exportable).toBe(true);
});
