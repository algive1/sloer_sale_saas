import { describe, expect, it } from "vitest";
import { getChatwootBinding, parseChatwootSupportConfig } from "./config";

const sites = ["fashion", "jewelry"];
const mapping = JSON.stringify([
  { siteId: "fashion", accountId: 1, websiteToken: "fashion_public_token" },
  { siteId: "jewelry", accountId: 2, websiteToken: "jewelry_public_token" },
]);
const parse = (raw = mapping, base = "https://support.example.com", ids: readonly string[] = sites) =>
  parseChatwootSupportConfig(base, raw, ids);

describe("Chatwoot system-level brand bindings", () => {
  it("is disabled unless configured, without a database or public script request", () => {
    expect(parseChatwootSupportConfig(undefined, undefined, sites)).toBeNull();
  });
  it("resolves exactly one Account and Inbox token per brand", () => {
    const config = parse();
    expect(getChatwootBinding(config, "fashion")).toEqual({
      siteId: "fashion", accountId: 1, websiteToken: "fashion_public_token",
    });
    expect(getChatwootBinding(config, "jewelry")?.accountId).toBe(2);
    expect(getChatwootBinding(config, "unknown")).toBeNull();
    expect(config?.baseUrl).toBe("https://support.example.com");
  });
  it("rejects partial configuration, missing brands and unexpected brands", () => {
    expect(() => parseChatwootSupportConfig(undefined, mapping, sites)).toThrow();
    expect(() => parseChatwootSupportConfig("https://support.example.com", undefined, sites)).toThrow();
    expect(() => parse(mapping, "https://support.example.com", ["fashion"])).toThrow();
    expect(() => parse(mapping, "https://support.example.com", ["fashion", "other"])).toThrow();
    expect(() => parse("{}", "https://support.example.com")).toThrow();
  });
  it("rejects accidental cross-brand contact merging", () => {
    const mappings = JSON.parse(mapping) as Array<{siteId:string;accountId:number;websiteToken:string}>;
    mappings[1].accountId = 1;
    expect(() => parse(JSON.stringify(mappings))).toThrow(/exclusive/);
    mappings[1].accountId = 2;
    mappings[1].websiteToken = mappings[0].websiteToken;
    expect(() => parse(JSON.stringify(mappings))).toThrow(/exclusive/);
    mappings[1].websiteToken = "jewelry_public_token";
    mappings[1].siteId = "fashion";
    expect(() => parse(JSON.stringify(mappings))).toThrow(/exclusive/);
  });
  it("rejects non-HTTPS origins, userinfo, paths and injected URL data", () => {
    for (const url of [
      "http://support.example.com", "https://user:secret@support.example.com",
      "https://support.example.com/redirect", "https://support.example.com/?site=other",
      "javascript:alert(1)", "https://support.example.com/#foo",
    ]) expect(() => parse(mapping, url)).toThrow();
    expect(() => parseChatwootSupportConfig("http://localhost:3001", mapping, sites, true)?.baseUrl)
      .toBe("http://localhost:3001");
    expect(() => parseChatwootSupportConfig("http://support.example.com", mapping, sites, true)).toThrow();
  });
  it("rejects invalid identifiers rather than trusting client-provided values", () => {
    const items = JSON.parse(mapping) as Array<{siteId:string;accountId:number;websiteToken:string}>;
    items[0].accountId = -1;
    expect(() => parse(JSON.stringify(items))).toThrow();
    items[0].accountId = 1;
    items[0].siteId = "../../jewelry";
    expect(() => parse(JSON.stringify(items))).toThrow();
    items[0].siteId = "fashion";
    items[0].websiteToken = "<script>";
    expect(() => parse(JSON.stringify(items))).toThrow();
  });
});
