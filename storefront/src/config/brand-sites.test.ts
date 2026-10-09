import { afterEach, describe, expect, it } from "vitest";
import {
  brandSiteForChannel, brandSiteForHost, hostName, parseBrandSites, siteIdForChannel,
} from "./brand-sites";

const config = JSON.stringify([
  { id: "fashion", name: "Fashion", domains: ["fashion.example", "www.fashion.example"],
    channels: ["fashion-us", "fashion-eu"], defaultChannel: "fashion-us", defaultLocale: "en" },
  { id: "jewelry", name: "Jewelry", domains: ["jewelry.example"],
    channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
]);

afterEach(() => {
  delete process.env.STOREFRONT_SITES_JSON;
  delete process.env.STOREFRONT_SITE_ID;
});

describe("multi-brand deterministic tenant mapping", () => {
  it("keeps legacy deployments unchanged", () => {
    process.env.STOREFRONT_SITE_ID = "existing-store";
    expect(siteIdForChannel("us")).toBe("existing-store");
    expect(brandSiteForHost("unknown.example")).toBeNull();
  });

  it("resolves exact domains and channels without database lookups", () => {
    process.env.STOREFRONT_SITES_JSON = config;
    expect(brandSiteForHost("WWW.FASHION.EXAMPLE:443")?.id).toBe("fashion");
    expect(brandSiteForChannel("fashion-eu")?.id).toBe("fashion");
    expect(siteIdForChannel("jewelry-us")).toBe("jewelry");
    expect(brandSiteForHost("attackerfashion.example")).toBeNull();
    expect(brandSiteForHost("fashion.example.evil.test")).toBeNull();
    expect(brandSiteForChannel("us")).toBeNull();
    expect(() => siteIdForChannel("us")).toThrow("no configured brand");
  });

  it("does not trust forwarded lists, URLs, paths or user info as Host", () => {
    expect(hostName("fashion.example, jewelry.example")).toBeNull();
    expect(hostName("https://fashion.example")).toBeNull();
    expect(hostName("fashion.example/path")).toBeNull();
    expect(hostName("evil@fashion.example")).toBeNull();
    expect(hostName("fashion.example:3100")).toBe("fashion.example");
  });

  it("refuses duplicate domain and cross-brand channel assignments", () => {
    expect(() => parseBrandSites(JSON.stringify([
      { id: "one", name: "One", domains: ["one.example"], channels: ["us"], defaultChannel: "us" },
      { id: "two", name: "Two", domains: ["one.example"], channels: ["eu"], defaultChannel: "eu" },
    ]))).toThrow("Domain is assigned");
    expect(() => parseBrandSites(JSON.stringify([
      { id: "one", name: "One", domains: ["one.example"], channels: ["us"], defaultChannel: "us" },
      { id: "two", name: "Two", domains: ["two.example"], channels: ["us"], defaultChannel: "us" },
    ]))).toThrow("Channel is assigned");
  });

  it("rejects invalid or incomplete mapping instead of falling back to another brand", () => {
    expect(() => parseBrandSites("oops")).toThrow("valid JSON");
    expect(() => parseBrandSites("{}")).toThrow("non-empty array");
    expect(() => parseBrandSites(JSON.stringify([
      { id: "one", name: "One", domains: ["one.example"], channels: ["us"], defaultChannel: "eu" },
    ]))).toThrow("defaultChannel");
  });
});
