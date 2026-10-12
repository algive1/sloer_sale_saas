import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clientAdsActive, clientAnalyticsActive, configureClientTrackingPolicy, withClientTrackingPolicy } from "./tracking-policy.client";
beforeEach(() => { configureClientTrackingPolicy(null); vi.stubGlobal("window", {}); });
afterEach(() => { configureClientTrackingPolicy(null); vi.unstubAllGlobals(); });
it("does no tracking before the server policy arrives and replays only after initialization", () => {
  const order: string[] = [];
  withClientTrackingPolicy(policy => order.push(policy.collectAnalytics ? "analytics" : "paused"));
  expect(order).toEqual([]); expect(clientAnalyticsActive()).toBe(false); expect(clientAdsActive()).toBe(false);
  configureClientTrackingPolicy({ collectAnalytics: true, trackAds: false }, () => order.push("consent"));
  expect(order).toEqual(["consent", "analytics"]); expect(clientAdsActive()).toBe(false);
});
it("bounds pending events while a slow/failed policy slot has not hydrated", () => {
  const event = vi.fn(); for (let i = 0; i < 150; i++) withClientTrackingPolicy(event);
  configureClientTrackingPolicy({ collectAnalytics: false, trackAds: false });
  expect(event).toHaveBeenCalledTimes(100); expect(clientAnalyticsActive()).toBe(false); expect(clientAdsActive()).toBe(false);
});
it("honors independent analytics and advertising policies and later reconfiguration", () => {
  configureClientTrackingPolicy({ collectAnalytics: false, trackAds: true });
  expect(clientAnalyticsActive()).toBe(false); expect(clientAdsActive()).toBe(true);
  configureClientTrackingPolicy({ collectAnalytics: true, trackAds: false });
  expect(clientAnalyticsActive()).toBe(true); expect(clientAdsActive()).toBe(false);
});
