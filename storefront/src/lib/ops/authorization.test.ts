import { describe, expect, it } from "vitest";
import { authorizeOpsRequest, parseOpsOperators, resolveOpsViewer } from "./authorization";

const shared = "L".repeat(40);
const adminPassword = "A".repeat(40);
const analystPassword = "B".repeat(40);
const accounts = JSON.stringify([
  { username:"platform_owner", password:adminPassword, role:"platform_admin" },
  { username:"fashion_staff", password:analystPassword, role:"brand_analyst", siteIds:["fashion"] },
]);
const sites = ["fashion", "jewelry"];
const basic = (username:string,password:string) => "Basic " + btoa(username + ":" + password);
const check = (authorization:string|null, pathname:string, method="GET", operatorsJson:string|undefined=accounts) =>
  authorizeOpsRequest({ authorization, pathname, method, operatorsJson, legacySecret:shared, trustedSiteIds:sites });

describe("operations operator accounts", () => {
  it("preserves the original shared administrator when no operator configuration exists", () => {
    expect(check(basic("analytics",shared),"/ops/translations","POST","")).toBe("allowed");
    expect(check(basic("analytics","wrong"),"/ops/analytics","GET","")).toBe("unauthenticated");
    expect(authorizeOpsRequest({authorization:basic("analytics",shared),pathname:"/ops",method:"GET",operatorsJson:undefined,legacySecret:undefined,trustedSiteIds:[]})).toBe("disabled");
  });

  it("replaces rather than adds to the legacy administrator secret", () => {
    expect(check(basic("analytics",shared),"/ops/analytics")).toBe("unauthenticated");
    expect(check(basic("platform_owner",adminPassword),"/ops/analytics")).toBe("allowed");
    expect(check(basic("platform_owner",adminPassword),"/ops/translations/api","POST")).toBe("allowed");
    expect(check(null,"/ops/sites/fashion")).toBe("unauthenticated");
    expect(check("Basic ???","/ops/sites/fashion")).toBe("unauthenticated");
    expect(check(basic("fashion_staff","wrong"),"/ops/sites/fashion")).toBe("unauthenticated");
  });

  it("only allows a brand analyst to read exact routes of an assigned brand", () => {
    const auth = basic("fashion_staff",analystPassword);
    for (const path of [
      "/ops/sites",
      "/ops/sites/",
      "/ops/sites/fashion",
      "/ops/sites/fashion/",
      "/ops/sites/fashion?days=7".split("?")[0]!,
      "/ops/sites/fashion/insights",
      "/ops/sites/fashion/readiness",
    ]) expect(check(auth,path)).toBe("allowed");
    expect(check(auth,"/ops/sites/fashion/insights","HEAD")).toBe("allowed");

    for (const path of [
      "/ops", "/ops/sites/jewelry",
      "/ops/sites/jewelry/insights", "/ops/analytics",
      "/ops/analytics/products", "/ops/plugins", "/ops/themes",
      "/ops/themes/api", "/ops/translations", "/ops/translations/api",
      "/ops/support", "/ops/sites/fashion/insights/export",
      "/ops/sites/fashion%2F..%2Fjewelry", "/ops/sites/fashion.json",
    ]) expect(check(auth,path)).toBe("forbidden");
    expect(check(auth,"/ops/sites","POST")).toBe("forbidden");
    expect(check(auth,"/ops/sites/fashion","POST")).toBe("forbidden");
    expect(check(auth,"/ops/sites/fashion/insights","DELETE")).toBe("forbidden");
    expect(check(auth,"/ops/api/analytics/reminders/run","POST")).toBe("forbidden");
  });

  it("resolves server-only viewer identity without trusting selected UI site", () => {
    const args = {operatorsJson: accounts, legacySecret:shared, trustedSiteIds:sites};
    expect(resolveOpsViewer({...args, authorization:basic("fashion_staff",analystPassword)})).toEqual({
      role:"brand_analyst",siteIds:["fashion"],
    });
    expect(resolveOpsViewer({...args, authorization:basic("platform_owner",adminPassword)})).toEqual({
      role:"platform_admin",siteIds:[],
    });
    expect(resolveOpsViewer({...args, authorization:basic("analytics",shared)})).toBeNull();
    expect(resolveOpsViewer({...args, authorization:null})).toBeNull();
    expect(resolveOpsViewer({...args, operatorsJson:"", authorization:basic("analytics",shared)})).toEqual({
      role:"platform_admin",siteIds:[],
    });
  });

  it("rejects partial, weak and duplicate operator configs without legacy fallback", () => {
    expect(() => parseOpsOperators("{broken",sites)).toThrow();
    expect(() => parseOpsOperators("[]",sites)).toThrow();
    expect(() => parseOpsOperators(JSON.stringify([
      { username:"fashion_staff", password:"too-short", role:"brand_analyst", siteIds:["fashion"] },
    ]),sites)).toThrow();
    expect(() => parseOpsOperators(JSON.stringify([
      { username:"fashion_staff", password:analystPassword, role:"brand_analyst", siteIds:["jewelry","jewelry"] },
    ]),sites)).toThrow();
    expect(() => parseOpsOperators(JSON.stringify([
      { username:"fashion_staff", password:analystPassword, role:"brand_analyst", siteIds:["unconfigured"] },
    ]),sites)).toThrow();
    expect(() => parseOpsOperators(JSON.stringify([
      { username:"fashion_staff", password:analystPassword, role:"brand_analyst", siteIds:["fashion"] },
      { username:"fashion_staff", password:adminPassword, role:"platform_admin" },
    ]),sites)).toThrow();
    expect(() => parseOpsOperators(JSON.stringify([
      { username:"platform_owner", password:adminPassword, role:"platform_admin", siteIds:["fashion"] },
    ]),sites)).toThrow();
    expect(() => parseOpsOperators(JSON.stringify([
      { username:"analytics", password:adminPassword, role:"platform_admin" },
    ]),sites)).toThrow();
    expect(() => parseOpsOperators(JSON.stringify([
      { username:"fashion_staff", password:analystPassword, role:"brand_analyst", siteIds:["fashion"] },
    ]),[])).toThrow();
  });
});
