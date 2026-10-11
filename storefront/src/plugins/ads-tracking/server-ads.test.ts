import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";

const state = vi.hoisted(() => ({ db: null as DatabaseSync | null, configured: true, down: false, failFinish: false }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/libsql-http", async (original) => ({
  ...await original<typeof import("@/lib/storage/libsql-http")>(),
  analyticsDatabaseConfigured: () => state.configured,
  libsqlPipeline: async (statements: Array<{ sql: string; args?: Array<string | number | boolean | null>; wantRows?: boolean }>) => {
    if (state.down) throw new Error("storage unavailable");
    return statements.map(s => {
      if (state.failFinish && s.sql.startsWith("UPDATE")) throw new Error("write unavailable");
      const stmt = state.db!.prepare(s.sql);
      const args = (s.args ?? []).map(a => typeof a === "boolean" ? Number(a) : a);
      if (!s.wantRows) return { cols: [], rows: [], affected_row_count: Number(stmt.run(...args).changes) };
      const rows = stmt.all(...args); const names = stmt.columns().map(c => c.name);
      return { cols: names.map(name => ({ name })), rows: rows.map(row => names.map(name => {
        const v = row[name]; return v === null ? { type: "null" } : typeof v === "number" ? { type: "float", value: v } : { type: "text", value: String(v) };
      })) };
    });
  },
}));

const brands = [
  { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us"], defaultChannel: "fashion-us" },
  { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
];
const configs = brands.map((site, i) => ({ siteId: site.id,
  ga4: { id: `G-BRAND${i}`, secret: `ga-secret-${i}` },
  meta: { id: `12345${i}`, secret: `meta-secret-${i}` },
  tiktok: { id: `TIKBRAND${i}`, secret: `tik-secret-${i}` },
}));
const event = (channel = "fashion-us", eventId = "order:1"): PaperCommerceEvent => ({ name: "checkout_completed", channel, eventId, transactionId: "1", value: 20, currency: "USD", items: [{ itemId: "sku1", quantity: 1, price: 20 }] });
const headers = (host = "fashion.example", consent = "granted") => new Headers({ host, cookie: `paper_analytics_consent=${consent}; paper_analytics_sid=session-1`, "user-agent": "test browser", referer: `https://${host}/checkout?email=customer@example.test` });
let api: typeof import("./server-ads");
let config: typeof import("./server-config");
let db: typeof import("./delivery-store");
let provider: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(async () => {
  vi.resetModules(); state.db = new DatabaseSync(":memory:"); state.configured = true; state.down = state.failFinish = false;
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify(brands));
  vi.stubEnv("ADS_SERVER_SITES_JSON", JSON.stringify(configs));
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_MODE", "required");
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_URL", "https://wrong-global.example");
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-WRONG"); vi.stubEnv("GA4_API_SECRET", "wrong-global-secret");
  vi.stubEnv("ANALYTICS_CLIENT_IP_HEADER", "");
  provider = vi.fn(async (input) => String(input).includes("google-analytics") ? new Response(null, { status: 204 }) : String(input).includes("facebook") ? Response.json({ events_received: 1 }) : Response.json({ code: 0 }));
  vi.stubGlobal("fetch", provider);
  [api, config, db] = await Promise.all([import("./server-ads"), import("./server-config"), import("./delivery-store")]);
});
afterEach(() => { state.db!.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("trusted brand destinations", () => {
  it("uses separate IDs/secrets, redacts URL and keeps persisted diagnostics free of personal data", async () => {
    await api.deliverServerDestinations(event("jewelry-us"), headers("jewelry.example"));
    expect(provider).toHaveBeenCalledTimes(3);
    const calls = JSON.stringify(provider.mock.calls);
    expect(calls).toContain("G-BRAND1"); expect(calls).toContain("meta-secret-1"); expect(calls).not.toMatch(/BRAND0|wrong-global|customer@example/);
    const records = await db.readAdDeliveries("jewelry"); expect(records).toHaveLength(3); expect(await db.readAdDeliveries("fashion")).toEqual([]);
    expect(records.map(r => r.status).sort()).toEqual(["provider_accepted", "provider_accepted", "transport_accepted"]);
    expect(JSON.stringify(records)).not.toMatch(/secret|session-1|https:|test browser|customer@example/);
    expect(JSON.stringify(config.serverAdConfiguration())).not.toMatch(/secret/);
  });
  it.each([["fashion-us", "jewelry.example"], ["unknown", "fashion.example"], ["fashion-us", "unknown.example"]])("blocks mismatched channel %s / host %s before storage or network", async (channel, host) => {
    await api.deliverServerDestinations(event(channel), headers(host));
    expect(provider).not.toHaveBeenCalled(); expect(state.db!.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
  });
  it("ignores forwarded host and foreign referrer", async () => {
    const h = headers(); h.set("x-forwarded-host", "jewelry.example"); h.set("referer", "https://jewelry.example/secret");
    await api.deliverServerDestinations(event(), h);
    expect(JSON.stringify(provider.mock.calls)).toContain("https://fashion.example"); expect(JSON.stringify(provider.mock.calls)).not.toContain("jewelry.example");
  });
  it.each(["", "denied", "forged"])("requires consent choice %s in required mode", async choice => {
    await api.deliverServerDestinations(event(), headers("fashion.example", choice)); expect(provider).not.toHaveBeenCalled();
  });
  it("implied analytics mode still forbids ads without an explicit grant and denies GA4 ads consent", async () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_MODE", "implied");
    await api.deliverServerDestinations(event(), headers("fashion.example", ""));
    expect(provider).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(provider.mock.calls[0][1]?.body)) as { consent: unknown };
    expect(payload.consent).toEqual({ ad_user_data: "DENIED", ad_personalization: "DENIED" });
  });
  it.each(["", "{", JSON.stringify([{ ...configs[0], siteId: "unknown" }]), JSON.stringify([configs[0], configs[0]]), JSON.stringify([{ siteId: "fashion", ga4: { id: "G-OK" } }])])("missing/invalid registry never falls back to global credentials %#", async raw => {
    vi.stubEnv("ADS_SERVER_SITES_JSON", raw); await api.deliverServerDestinations(event(), headers()); expect(provider).not.toHaveBeenCalled();
  });
  it("only signed-order callers may use trusted channel without a shopper Host", async () => {
    await api.deliverGa4ServerEvent(event(), new Headers(), "jewelry-us"); expect(provider).not.toHaveBeenCalled();
    await api.deliverGa4ServerEvent(event(), new Headers(), "fashion-us"); expect(provider).toHaveBeenCalledTimes(1);
    expect(String(provider.mock.calls[0][0])).toContain("G-BRAND0");
  });
  it("does not trust client IP headers by default; configured proxy IP must be valid", async () => {
    const h = headers(); h.set("x-forwarded-for", "1.2.3.4"); h.set("cf-connecting-ip", "5.6.7.8");
    await api.deliverServerDestinations(event(), h); expect(JSON.stringify(provider.mock.calls)).not.toMatch(/1\.2\.3\.4|5\.6\.7\.8/);
    vi.stubEnv("ANALYTICS_CLIENT_IP_HEADER", "cf-connecting-ip");
    await api.deliverServerDestinations(event("fashion-us", "2"), h); expect(JSON.stringify(provider.mock.calls)).toContain("5.6.7.8");
    h.set("cf-connecting-ip", "5.6.7.8,9.8.7.6"); provider.mockClear();
    await api.deliverServerDestinations(event("fashion-us", "3"), h); expect(JSON.stringify(provider.mock.calls)).not.toContain("5.6.7.8");
  });
  it("keeps configured single-brand compatibility without a database", async () => {
    vi.stubEnv("STOREFRONT_SITES_JSON", ""); state.configured = false;
    await api.deliverServerDestinations(event(), headers()); expect(String(provider.mock.calls[0][0])).toContain("G-WRONG");
  });
});

describe("atomic delivery claims and conservative receipts", () => {
  it("concurrent requests and later reloads send one event to each destination", async () => {
    await Promise.all([api.deliverServerDestinations(event(), headers()), api.deliverServerDestinations(event(), headers())]);
    await api.deliverServerDestinations(event(), headers()); expect(provider).toHaveBeenCalledTimes(3);
  });
  it("a duplicate event ID in another brand has independent claims", async () => {
    await api.deliverServerDestinations(event(), headers()); await api.deliverServerDestinations(event("jewelry-us"), headers("jewelry.example")); expect(provider).toHaveBeenCalledTimes(6);
  });
  it("missing, unavailable or unwriteable database stops brand delivery", async () => {
    state.configured = false; await api.deliverServerDestinations(event(), headers()); expect(provider).not.toHaveBeenCalled();
    state.configured = true; state.down = true; await api.deliverServerDestinations(event(), headers()); expect(provider).not.toHaveBeenCalled();
  });
  it("events without a bounded ID are not sent", async () => {
    await api.deliverServerDestinations(event("fashion-us", ""), headers()); await api.deliverServerDestinations(event("fashion-us", "x".repeat(257)), headers()); expect(provider).not.toHaveBeenCalled();
  });
  it("provider rejection is recorded without storing an upstream error or retrying", async () => {
    provider.mockImplementation(async input => String(input).includes("google") ? new Response(null, { status: 400 }) : Response.json({ error: "secret upstream email", code: 400 }));
    await api.deliverServerDestinations(event(), headers()); await api.deliverServerDestinations(event(), headers());
    expect(provider).toHaveBeenCalledTimes(3); const records = await db.readAdDeliveries("fashion");
    expect(records.every(r => r.status === "failed")).toBe(true); expect(JSON.stringify(records)).not.toContain("secret upstream");
  });
  it("network or malformed receipt remains uncertain and cannot be resent", async () => {
    provider.mockRejectedValue(new Error("secret URL / timeout"));
    await api.deliverServerDestinations(event(), headers()); await api.deliverServerDestinations(event(), headers());
    expect(provider).toHaveBeenCalledTimes(3); expect((await db.readAdDeliveries("fashion")).every(r => r.status === "unconfirmed")).toBe(true);
  });
  it("an unavailable finish write retains an in-flight claim", async () => {
    state.failFinish = true; await api.deliverServerDestinations(event(), headers()); state.failFinish = false;
    await api.deliverServerDestinations(event(), headers()); expect(provider).toHaveBeenCalledTimes(3);
    expect((await db.readAdDeliveries("fashion")).every(r => r.status === "sending")).toBe(true);
  });
});
