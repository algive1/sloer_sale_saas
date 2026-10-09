import { beforeEach, describe, expect, it, vi } from "vitest";
import { FASHION_TEMPLATE } from "./template";

const { pipeline } = vi.hoisted(() => ({ pipeline: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/libsql-http", () => ({
  libsqlPipeline: pipeline,
  hranaRowsToObjects: () => [],
}));

import { saveTheme, ThemeConflictError } from "./store";

describe("theme draft compare-and-swap", () => {
  beforeEach(() => {
    process.env.THEME_LIBSQL_URL = "libsql://theme-test.example";
    process.env.THEME_LIBSQL_AUTH_TOKEN = "unit-test-only";
    process.env.STOREFRONT_SITE_ID = "fashion-shop";
    delete process.env.STOREFRONT_SITES_JSON;
    pipeline.mockReset();
    pipeline.mockResolvedValue([{ cols: [], rows: [], affected_row_count: 1 }]);
  });

  it("inserts the initial draft without publishing it", async () => {
    expect(await saveTheme("us", "en", FASHION_TEMPLATE, false, 0)).toBe(1);
    const [statements] = pipeline.mock.lastCall as [Array<{sql:string;args:unknown[]}>];
    expect(statements[0].sql).toContain("INSERT OR IGNORE");
    expect(statements[0].args.slice(0, 3)).toEqual(["fashion-shop", "us", "en"]);
    expect(statements[0].args[4]).toBeNull();
  });

  it("requires the expected revision for a published update", async () => {
    expect(await saveTheme("us", "en", FASHION_TEMPLATE, true, 3)).toBe(4);
    const [statements] = pipeline.mock.lastCall as [Array<{sql:string;args:unknown[]}>];
    expect(statements[0].sql).toContain("published_json = ?");
    expect(statements[0].sql).toContain("draft_revision = ?");
    expect(statements[0].args.slice(-4)).toEqual(["fashion-shop", "us", "en", 3]);
  });

  it("keeps two brands with separate Saleor channels in distinct theme partitions", async () => {
    process.env.STOREFRONT_SITES_JSON = JSON.stringify([
      { id: "fashion", name: "Fashion", domains: ["fashion.example"], channels: ["fashion-us"],
        defaultChannel: "fashion-us" },
      { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"], channels: ["jewelry-us"],
        defaultChannel: "jewelry-us" },
    ]);
    await saveTheme("fashion-us", "en", FASHION_TEMPLATE, false, 0);
    const [first] = pipeline.mock.lastCall as [Array<{ args: unknown[] }>];
    expect(first[0].args[0]).toBe("fashion");
    await saveTheme("jewelry-us", "en", FASHION_TEMPLATE, false, 0);
    const [second] = pipeline.mock.lastCall as [Array<{ args: unknown[] }>];
    expect(second[0].args[0]).toBe("jewelry");
    await expect(saveTheme("unmapped", "en", FASHION_TEMPLATE, false, 0)).rejects.toThrow(
      "no configured brand",
    );
  });

  it("rejects stale edits instead of overwriting someone else's version", async () => {
    pipeline.mockResolvedValue([{ cols: [], rows: [], affected_row_count: 0 }]);
    await expect(saveTheme("us", "en", FASHION_TEMPLATE, false, 2)).rejects.toBeInstanceOf(
      ThemeConflictError,
    );
  });

  it("rejects invalid revision numbers", async () => {
    await expect(saveTheme("us", "en", FASHION_TEMPLATE, true, -1)).rejects.toBeInstanceOf(
      ThemeConflictError,
    );
  });
});
