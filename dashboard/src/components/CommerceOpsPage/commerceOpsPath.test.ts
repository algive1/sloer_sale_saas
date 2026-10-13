import { isCommerceOpsPagePath } from "./commerceOpsPath";

describe("isCommerceOpsPagePath", () => {
  it.each([
    "/ops/analytics",
    "/ops/analytics/realtime",
    "/ops/analytics/traffic",
    "/ops/analytics/checkout",
    "/ops/analytics/products",
    "/ops/analytics/destinations",
    "/ops/analytics/reminders",
    "/ops/sites",
    "/ops/sites/fashion/catalog",
    "/ops/sites/fashion",
    "/ops/sites/fashion/insights?days=30",
    "/ops/sites/fashion/fulfillment",
    "/ops/sites/fashion/realtime",
    "/ops/sites/fashion/readiness",
    "/ops/sites/fashion/tracking?channel=us",
    "/ops/themes?pageType=product",
    "/ops/themes",
    "/ops/support",
    "/ops/support/settings",
    "/ops/plugins",
    "/ops/merchant",
    "/ops/translations",
  ])("accepts an existing management page: %s", path => {
    expect(isCommerceOpsPagePath(path)).toBe(true);
  });

  it.each([
    null,
    "https://attacker.example/ops/plugins",
    "/ops/login",
    "/ops/api/analytics/reminders/run",
    "/ops/themes/../../api/secret",
    "/ops/unknown",
  ])("rejects a non-page or unsafe path: %s", path => {
    expect(isCommerceOpsPagePath(path)).toBe(false);
  });
});
