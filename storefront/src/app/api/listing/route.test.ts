import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  channels: vi.fn(),
  listing: vi.fn(),
}));

vi.mock("@/lib/channel-slugs", () => ({
  getStorefrontChannelSlugs: mocks.channels,
}));
vi.mock("@/lib/catalog/fetch-filtered-listing", () => ({
  loadListing: mocks.listing,
  listingViewFromSearchParams: () => ({}),
}));
// The route imports the view parser from @/lib/catalog/listing-query, not the loader.
vi.mock("@/lib/catalog/listing-query", () => ({
  listingViewFromSearchParams: () => ({}),
}));

import { GET } from "./route";

const brands = JSON.stringify([
  { id: "fashion", name: "Fashion", domains: ["fashion.example.test"],
    channels: ["us"], defaultChannel: "us" },
  { id: "jewelry", name: "Jewelry", domains: ["jewelry.example.test"],
    channels: ["jewelry-us"], defaultChannel: "jewelry-us" },
]);

function listingRequest(host: string, channel: string, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(
    `https://fashion.example.test/api/listing?surface=all&locale=en&channel=${encodeURIComponent(channel)}`,
    { headers: { host, ...extraHeaders } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channels.mockResolvedValue(["us", "jewelry-us"]);
  mocks.listing.mockResolvedValue({ products: [{ id: "product-1" }], pageInfo: { hasNextPage: false } });
});
afterEach(() => vi.unstubAllEnvs());

describe("multi-brand listing API authorization", () => {
  it("serves each brand's own published channel without changing JSON/no-store behavior", async () => {
    vi.stubEnv("STOREFRONT_SITES_JSON", brands);
    for (const [host, channel] of [["fashion.example.test", "us"], ["jewelry.example.test", "jewelry-us"]]) {
      const response = await GET(listingRequest(host, channel));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect((await response.json()).products).toHaveLength(1);
    }
    expect(mocks.listing).toHaveBeenCalledTimes(2);
    expect(mocks.listing.mock.calls[0]?.[0]).toMatchObject({ channel: "us", locale: "en", surface: "all" });
    expect(mocks.listing.mock.calls[1]?.[0]).toMatchObject({ channel: "jewelry-us", locale: "en", surface: "all" });
  });

  it("rejects foreign brand and unknown Host before channel discovery or catalog I/O", async () => {
    vi.stubEnv("STOREFRONT_SITES_JSON", brands);
    for (const request of [
      listingRequest("fashion.example.test", "jewelry-us"),
      listingRequest("jewelry.example.test", "us"),
      listingRequest("unknown.example.test", "us"),
      listingRequest("", "us"),
      listingRequest("fashion.example.test, jewelry.example.test", "us"),
      listingRequest("fashion.example.test", "unlisted"),
    ]) {
      const response = await GET(request);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(mocks.channels).not.toHaveBeenCalled();
    expect(mocks.listing).not.toHaveBeenCalled();
  });

  it("does not accept x-forwarded-host as an override for the actual Host", async () => {
    vi.stubEnv("STOREFRONT_SITES_JSON", brands);
    const response = await GET(listingRequest("fashion.example.test", "jewelry-us", {
      "x-forwarded-host": "jewelry.example.test",
    }));
    expect(response.status).toBe(404);
    expect(mocks.listing).not.toHaveBeenCalled();
  });

  it("preserves existing single-brand API behavior", async () => {
    vi.stubEnv("STOREFRONT_SITES_JSON", "");
    const response = await GET(listingRequest("arbitrary.example.test", "jewelry-us"));
    expect(response.status).toBe(200);
    expect(mocks.listing).toHaveBeenCalledTimes(1);
  });

  it("still rejects an invalid locale before touching the catalog", async () => {
    vi.stubEnv("STOREFRONT_SITES_JSON", brands);
    const request = new NextRequest("https://fashion.example.test/api/listing?surface=all&locale=invalid&channel=us", {
      headers: { host: "fashion.example.test" },
    });
    expect((await GET(request)).status).toBe(400);
    expect(mocks.listing).not.toHaveBeenCalled();
  });
});
