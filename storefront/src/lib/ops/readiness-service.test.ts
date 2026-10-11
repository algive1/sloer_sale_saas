import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as DatabaseSync | null, available: true, active: true, backend: true, themeRevision: 1 }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/graphql", () => ({ executeAppGraphQL: vi.fn(async () => state.backend ? { ok: true, data: { channels: [
  { slug: "us", isActive: state.active }, { slug: "jewelry-us", isActive: true },
] } } : { ok: false }) }));
vi.mock("@/plugins/theme-builder/store", () => ({
  themeDatabaseConfigured: () => true,
  readTheme: vi.fn(async () => ({ publishedRevision: state.themeRevision })),
}));
vi.mock("@/lib/storage/libsql-http", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/storage/libsql-http")>();
  return { ...original, analyticsDatabaseConfigured: () => state.available,
    libsqlPipeline: vi.fn(async (statements: Array<{ sql: string; args?: Array<string | number | null>; wantRows?: boolean }>) => {
      if (!state.available) throw new Error("database unavailable");
      return statements.map(statement => {
        const query = state.db!.prepare(statement.sql);
        if (!statement.wantRows) return { cols: [], rows: [], affected_row_count: Number(query.run(...statement.args ?? []).changes) };
        const names = query.columns().map(column => column.name);
        return { cols: names.map(name => ({ name })), rows: query.all(...statement.args ?? []).map(row => names.map(name =>
          row[name] === null ? { type: "null" } : typeof row[name] === "number" ? { type: "float", value: row[name] } : { type: "text", value: String(row[name]) })) };
      });
    }) };
});

import { brandReadiness, verifyBrandReadiness } from "./readiness-service";
import { readinessHistory } from "./readiness-store";
import { launchAllowed, recordStatus } from "./readiness-model";
import { executeAppGraphQL } from "@/lib/graphql";

const admin = { username: "ops_owner", role: "platform_admin" as const, siteIds: [] };
const analyst = { username: "fashion_reader", role: "brand_analyst" as const, siteIds: ["fashion"] };
const sites = [
  { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["us"], defaultChannel: "us", defaultLocale: "en" },
  { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"], defaultChannel: "jewelry-us", defaultLocale: "en" },
];
beforeEach(() => {
  state.db = new DatabaseSync(":memory:");
  state.available = state.active = state.backend = true; state.themeRevision = 1;
  vi.stubEnv("STOREFRONT_SITES_JSON", JSON.stringify(sites));
  vi.stubEnv("STOREFRONT_CHANNELS", "us,jewelry-us");
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALES", "en");
  vi.stubEnv("NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS", "en:us,en:jewelry-us");
  vi.stubEnv("SALEOR_APP_TOKEN", "test-token");
});
afterEach(() => { state.db?.close(); vi.unstubAllEnvs(); });

async function inputFor(checkId = "payment:us") {
  const snapshot = await brandReadiness("fashion");
  return { checkId, contextHash: snapshot.contextHash, expectedRevision: 0, result: "passed", environment: "production", evidence: "脱敏验收记录 TEST-001，测试步骤和失败/恢复结果已核对。" };
}

describe("brand launch gate", () => {
  it("never equates existing configuration with launch acceptance", async () => {
    const snapshot = await brandReadiness("fashion");
    expect(snapshot.canLaunch).toBe(false);
    expect(snapshot.checks.some(check => check.kind === "manual" && check.status === "passed")).toBe(false);
    expect(vi.mocked(executeAppGraphQL).mock.lastCall?.[1]).toEqual({ cache: "no-store" });
  });
  it("accepts a launch only when every required check passed and storage works", async () => {
    expect(launchAllowed([], true)).toBe(false);
    const checks = (await brandReadiness("fashion")).checks;
    expect(launchAllowed(checks.map(check => ({ ...check, status: "passed" })), true)).toBe(true);
    expect(launchAllowed(checks.map(check => ({ ...check, status: "passed" })), false)).toBe(false);
    for (const status of ["failed", "pending", "stale", "unavailable"] as const)
      expect(launchAllowed(checks.map((check, i) => ({ ...check, status: i ? "passed" : status })), true)).toBe(false);
  });
  it("keeps brand history isolated and records the authenticated operator", async () => {
    const snapshot = await verifyBrandReadiness("fashion", await inputFor(), admin);
    expect(snapshot.checks.find(check => check.id === "payment:us")?.record?.verifiedBy).toBe("ops_owner");
    expect(await readinessHistory("fashion")).toHaveLength(1);
    expect(await readinessHistory("jewelry")).toHaveLength(0);
    expect((await brandReadiness("jewelry")).checks.every(check => !check.record)).toBe(true);
  });
  it("saves sandbox results without treating them as production acceptance", async () => {
    const snapshot = await verifyBrandReadiness("fashion", { ...await inputFor(), environment: "test" }, admin);
    expect(snapshot.checks.find(check => check.id === "payment:us")?.status).toBe("pending");
    expect(snapshot.canLaunch).toBe(false);
  });
  it("blocks analysts, shared credentials and forged actor fields", async () => {
    const input = await inputFor();
    await expect(verifyBrandReadiness("fashion", input, analyst)).rejects.toThrow("individual_admin_required");
    await expect(verifyBrandReadiness("fashion", input, { ...admin, username: "analytics" })).rejects.toThrow();
    await expect(verifyBrandReadiness("fashion", input, null)).rejects.toThrow();
    await verifyBrandReadiness("fashion", { ...input, verifiedBy: "forged_actor" }, admin);
    expect((await readinessHistory("fashion"))[0]?.verifiedBy).toBe("ops_owner");
  });
  it("invalidates evidence on a config change and refuses stale forms", async () => {
    const input = await inputFor();
    await verifyBrandReadiness("fashion", input, admin);
    vi.stubEnv("OPS_READINESS_CONFIG_REVISION", "new-payment-configuration");
    expect((await brandReadiness("fashion")).checks.find(check => check.id === "payment:us")?.status).toBe("stale");
    await expect(verifyBrandReadiness("fashion", input, admin)).rejects.toThrow("readiness_context_changed");
    expect(await readinessHistory("fashion")).toHaveLength(1);
  });
  it("expires previous evidence after a theme publication or disabled channel", async () => {
    await verifyBrandReadiness("fashion", await inputFor(), admin);
    state.themeRevision++;
    expect((await brandReadiness("fashion")).checks.find(check => check.id === "payment:us")?.status).toBe("stale");
    state.active = false;
    const snapshot = await brandReadiness("fashion");
    expect(snapshot.checks.find(check => check.id === "channels")?.status).toBe("failed");
    expect(snapshot.canLaunch).toBe(false);
  });
  it("preserves history and rejects competing revisions atomically", async () => {
    const input = await inputFor();
    const results = await Promise.allSettled([
      verifyBrandReadiness("fashion", input, admin), verifyBrandReadiness("fashion", { ...input, result: "failed" }, admin),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await readinessHistory("fashion")).toHaveLength(1);
    const snapshot = await brandReadiness("fashion");
    await verifyBrandReadiness("fashion", { ...input, contextHash: snapshot.contextHash, expectedRevision: 1, result: "failed" }, admin);
    expect(await readinessHistory("fashion")).toHaveLength(2);
    expect((await brandReadiness("fashion")).checks.find(check => check.id === "payment:us")?.status).toBe("failed");
  });
  it("fails closed on backend or evidence storage outages", async () => {
    state.backend = false;
    expect((await brandReadiness("fashion")).checks.find(check => check.id === "channels")?.status).toBe("unavailable");
    state.available = false;
    const snapshot = await brandReadiness("fashion");
    expect(snapshot.canLaunch).toBe(false);
    expect(snapshot.storageAvailable).toBe(false);
    await expect(verifyBrandReadiness("fashion", await inputFor(), admin)).rejects.toThrow();
  });
  it("rejects foreign market keys, automatic overrides, empty evidence and unknown brands", async () => {
    const input = await inputFor();
    for (const checkId of ["payment:jewelry-us", "config", "unknown"]) await expect(verifyBrandReadiness("fashion", { ...input, checkId }, admin)).rejects.toThrow();
    for (const evidence of ["", "too short", "x".repeat(2001)]) await expect(verifyBrandReadiness("fashion", { ...input, evidence }, admin)).rejects.toThrow();
    await expect(verifyBrandReadiness("unknown", input, admin)).rejects.toThrow("unknown_brand");
  });
  it("does not turn old or malformed expiry into success", () => {
    const record = { checkId: "payment:us", revision: 1, contextHash: "current", result: "passed" as const, environment: "production" as const, verifiedBy: "ops_owner", verifiedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-08T00:00:00Z", evidence: "test" };
    expect(recordStatus(record, "current", Date.parse("2026-10-09"))).toBe("stale");
    expect(recordStatus({ ...record, expiresAt: "invalid" }, "current", 0)).toBe("stale");
  });
});
