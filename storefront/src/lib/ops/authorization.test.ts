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
      "/ops/sites/fashion/readiness/api",
      "/ops/sites/fashion/realtime",
      "/ops/sites/fashion/realtime/api",
      "/ops/sites/fashion/catalog",
      "/ops/sites/fashion/catalog/api",
      "/ops/sites/fashion/fulfillment",
      "/ops/sites/fashion/fulfillment/api",
    ]) expect(check(auth,path)).toBe("allowed");
    expect(check(auth,"/ops/sites/fashion/insights","HEAD")).toBe("allowed");

    for (const path of [
      "/ops", "/ops/sites/jewelry",
      "/ops/sites/jewelry/insights", "/ops/analytics",
      "/ops/sites/jewelry/readiness/api",
      "/ops/sites/jewelry/realtime/api", "/ops/api/analytics/realtime",
      "/ops/sites/jewelry/catalog/api",
      "/ops/sites/jewelry/fulfillment/api",
      "/ops/sites/fashion/tracking", "/ops/sites/fashion/tracking/api",
      "/ops/analytics/products", "/ops/plugins", "/ops/themes",
      "/ops/merchant",
      "/ops/themes/api", "/ops/translations", "/ops/translations/api",
      "/ops/support", "/ops/sites/fashion/insights/export",
      "/ops/sites/fashion%2F..%2Fjewelry", "/ops/sites/fashion.json",
    ]) expect(check(auth,path)).toBe("forbidden");
    expect(check(auth,"/ops/sites","POST")).toBe("forbidden");
    expect(check(auth,"/ops/sites/fashion","POST")).toBe("forbidden");
    expect(check(auth,"/ops/sites/fashion/insights","DELETE")).toBe("forbidden");
    expect(check(auth,"/ops/sites/fashion/realtime/api","POST")).toBe("forbidden");
    expect(check(auth,"/ops/sites/fashion/catalog/api","POST")).toBe("forbidden");
    expect(check(auth,"/ops/sites/fashion/fulfillment/api","POST")).toBe("forbidden");
    expect(check(auth,"/ops/api/analytics/reminders/run","POST")).toBe("forbidden");
  });

  it("resolves server-only viewer identity without trusting selected UI site", () => {
    const args = {operatorsJson: accounts, legacySecret:shared, trustedSiteIds:sites};
    expect(resolveOpsViewer({...args, authorization:basic("fashion_staff",analystPassword)})).toEqual({
      username:"fashion_staff",role:"brand_analyst",siteIds:["fashion"],
    });
    expect(resolveOpsViewer({...args, authorization:basic("platform_owner",adminPassword)})).toEqual({
      username:"platform_owner",role:"platform_admin",siteIds:[],
    });
    expect(resolveOpsViewer({...args, authorization:basic("analytics",shared)})).toBeNull();
    expect(resolveOpsViewer({...args, authorization:null})).toBeNull();
    expect(resolveOpsViewer({...args, operatorsJson:"", authorization:basic("analytics",shared)})).toEqual({
      username:"analytics",role:"platform_admin",siteIds:[],
    });
  });

  it("uses Saleor permissions and channel scope for the embedded Ops session", () => {
    const saleorViewer = {
      username: "staff@example.com",
      role: "brand_analyst" as const,
      siteIds: ["fashion"],
      authSource: "saleor" as const,
      permissions: ["MANAGE_ORDERS", "MANAGE_PRODUCTS"] as const,
      restrictedAccessToChannels: true,
    };
    const input = {
      authorization: null,
      operatorsJson: undefined,
      legacySecret: undefined,
      trustedSiteIds: sites,
      saleorSsoEnabled: true,
      saleorViewer,
    };

    expect(authorizeOpsRequest({ ...input, pathname: "/ops/analytics", method: "GET" })).toBe("forbidden");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops/sites", method: "GET" })).toBe("allowed");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops/sites/fashion/catalog", method: "GET" })).toBe("allowed");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops/sites/jewelry/catalog", method: "GET" })).toBe("forbidden");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops/sites/fashion/catalog/api", method: "POST" })).toBe("forbidden");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops/themes", method: "GET" })).toBe("forbidden");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops", method: "GET" })).toBe("forbidden");
  });

  it("requires a Saleor permission for each privileged Ops feature", () => {
    const saleorViewer = {
      username: "staff@example.com",
      role: "platform_admin" as const,
      siteIds: [],
      authSource: "saleor" as const,
      permissions: ["MANAGE_TRANSLATIONS"] as const,
      restrictedAccessToChannels: false,
    };
    const input = {
      authorization: null,
      operatorsJson: undefined,
      legacySecret: undefined,
      trustedSiteIds: sites,
      saleorSsoEnabled: true,
      saleorViewer,
    };

    expect(authorizeOpsRequest({ ...input, pathname: "/ops/translations/api", method: "POST" })).toBe("allowed");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops/plugins", method: "GET" })).toBe("forbidden");
    expect(authorizeOpsRequest({ ...input, pathname: "/ops/merchant", method: "GET" })).toBe("forbidden");
    expect(authorizeOpsRequest({
      ...input,
      saleorViewer: { ...saleorViewer, permissions: ["MANAGE_PRODUCTS", "MANAGE_SETTINGS"] },
      pathname: "/ops/merchant",
      method: "GET",
    })).toBe("allowed");
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
