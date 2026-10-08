import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ensureAnalyticsSchema as pluginSchema,
  recordRefundTotal as pluginRefunds,
  readAnalyticsSummary as pluginSummary,
  storeFirstPartyCommerceEvent as pluginEvents,
} from "./first-party-store";
import {
  ensureAnalyticsSchema as oldSchema,
  recordRefundTotal as oldRefunds,
  readAnalyticsSummary as oldSummary,
  storeFirstPartyCommerceEvent as oldEvents,
} from "@/lib/analytics/first-party-store";
import { readTrafficReport as pluginTraffic } from "./traffic-report";
import { readTrafficReport as oldTraffic } from "@/lib/analytics/traffic-report";
import { readCheckoutReport as pluginCheckout } from "./checkout-report";
import { readCheckoutReport as oldCheckout } from "@/lib/analytics/checkout-report";
import { readRealtimeAnalytics as pluginRealtime } from "./realtime-report";
import { readRealtimeAnalytics as oldRealtime } from "@/lib/analytics/realtime-report";
import { readProductReport as pluginProducts } from "./product-report";
import { readProductReport as oldProducts } from "@/lib/analytics/product-report";
import {
  readOverviewDetails as pluginOverview,
  readOverviewFinances as pluginFinance,
} from "./overview-details";
import {
  readOverviewDetails as oldOverview,
  readOverviewFinances as oldFinance,
} from "@/lib/analytics/overview-details";

describe("analytics module migration: stable exports without duplicate operations", () => {
  it("re-exports the same event persistence implementation", () => {
    expect(oldSchema).toBe(pluginSchema);
    expect(oldRefunds).toBe(pluginRefunds);
    expect(oldSummary).toBe(pluginSummary);
    expect(oldEvents).toBe(pluginEvents);
  });

  it("re-exports the same batched reports without adapter calls", () => {
    expect(oldTraffic).toBe(pluginTraffic);
    expect(oldCheckout).toBe(pluginCheckout);
    expect(oldRealtime).toBe(pluginRealtime);
    expect(oldProducts).toBe(pluginProducts);
    expect(oldOverview).toBe(pluginOverview);
    expect(oldFinance).toBe(pluginFinance);
  });
});
