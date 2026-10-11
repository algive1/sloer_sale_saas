import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { configureClientTrackingPolicy } from "./tracking-policy.client";
import { persistFirstTouch, sendGa4Event } from "@/lib/analytics/browser";
import { sendFirstPartyCommerceEvent } from "@/lib/analytics/first-party-client";
import { sendBrowserAdEvent, sendAdPageView } from "@/plugins/ads-tracking/browser-ads";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
const event = { name: "product_added_to_cart", channel: "us", value: 10, currency: "USD", eventId: "id" } as PaperCommerceEvent;
const cookies = vi.fn(); const network = vi.fn<typeof fetch>(async () => new Response());
const pixel = vi.fn(); const storage = vi.fn();
beforeEach(() => {
  cookies.mockClear(); network.mockClear(); pixel.mockClear(); storage.mockClear();
  configureClientTrackingPolicy(null);
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-POLICY"); vi.stubEnv("STOREFRONT_SITES_JSON", "");
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1234"); vi.stubEnv("NEXT_PUBLIC_TIKTOK_PIXEL_ID", "TESTPIXEL");
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_MODE", "required");
  const document = { documentElement: { dataset: {} } }; Object.defineProperty(document, "cookie", { get: () => "paper_analytics_consent=granted", set: cookies });
  vi.stubGlobal("document", document); vi.stubGlobal("fetch", network);
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: storage, removeItem: storage });
  vi.stubGlobal("window", { fbq: pixel, ttq: { track: pixel, page: pixel }, gtag: pixel,
    location: { href: "https://shop.example/en/us/products/coat", protocol: "https:" } });
});
afterEach(() => { configureClientTrackingPolicy(null); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("unknown or paused policy cannot write cookies/storage, ingest data or contact a pixel", () => {
  for (const policy of [null, { collectAnalytics: false, trackAds: false }]) {
    configureClientTrackingPolicy(policy); persistFirstTouch(); sendFirstPartyCommerceEvent(event);
    sendGa4Event({ name: "add_to_cart", params: {} }); sendBrowserAdEvent(event); sendAdPageView();
  }
  expect(cookies).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(pixel).not.toHaveBeenCalled();
});
it("analytics can keep first-party collection while all external tags are paused", () => {
  configureClientTrackingPolicy({ collectAnalytics: true, trackAds: false });
  sendFirstPartyCommerceEvent(event); sendGa4Event({ name: "add_to_cart", params: {} }); sendBrowserAdEvent(event);
  expect(network).toHaveBeenCalledOnce(); expect(network.mock.calls[0]?.[0]).toBe("/api/analytics/events"); expect(pixel).not.toHaveBeenCalled();
});
it("advertising can operate without first-party event storage", () => {
  configureClientTrackingPolicy({ collectAnalytics: false, trackAds: true });
  sendFirstPartyCommerceEvent(event); sendGa4Event({ name: "add_to_cart", params: {} });
  expect(network).not.toHaveBeenCalled(); expect(pixel).toHaveBeenCalledWith("event", "add_to_cart", {});
});
