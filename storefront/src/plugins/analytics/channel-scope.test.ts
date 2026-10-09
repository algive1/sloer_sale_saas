import { describe, expect, it } from "vitest";
import { analyticsChannelClause } from "./channel-scope";
describe("trusted brand analytics scope", () => {
  it("keeps the platform owner aggregate query unfiltered", () => {
    expect(analyticsChannelClause(null)).toEqual({ sql: "", args: [] });
  });
  it("uses bind arguments, not interpolated channel slugs", () => {
    expect(analyticsChannelClause(["fashion-us","fashion-eu","fashion-us"]))
      .toEqual({ sql: " AND channel IN (?, ?)", args: ["fashion-us","fashion-eu"] });
    expect(analyticsChannelClause(["jewelry-us"], "ae.channel"))
      .toEqual({ sql: " AND ae.channel IN (?)", args: ["jewelry-us"] });
  });
  it("fails closed on missing or malformed brand channels", () => {
    expect(() => analyticsChannelClause([])).toThrow("at least one");
    expect(() => analyticsChannelClause(["us') OR 1=1 --"])).toThrow("valid");
    expect(() => analyticsChannelClause(["us"], "untrusted.column")).toThrow("Invalid");
  });
});
