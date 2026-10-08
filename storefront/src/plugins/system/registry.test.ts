import { describe, expect, it } from "vitest";
import { getSystemPlugin, listSystemPlugins, SYSTEM_PLUGINS } from "./registry";

describe("system business plugin catalog", () => {
  it("enables all installed features for every shop without per-store settings", () => {
    const plugins = listSystemPlugins();
    expect(plugins).toHaveLength(5);
    for (const plugin of plugins) {
      expect(plugin.scope).toBe("system");
      expect(plugin.availability).toBe("all-stores");
      expect(plugin.apiVersion).toBe(1);
      expect(plugin.capabilities.length).toBeGreaterThan(0);
      expect("siteId" in plugin).toBe(false);
      expect("storeId" in plugin).toBe(false);
    }
  });

  it("shows migration status without pretending embedded features are extracted", () => {
    expect(getSystemPlugin("theme-builder").integration).toBe("storefront-module");
    expect(getSystemPlugin("payment-reminders").integration).toBe("storefront-module");
    for (const id of ["analytics", "ads-tracking", "seo-merchant"] as const) {
      expect(getSystemPlugin(id).integration).toBe("legacy-inline");
    }
    expect(Object.keys(SYSTEM_PLUGINS)).toEqual([
      "theme-builder", "analytics", "ads-tracking", "payment-reminders", "seo-merchant",
    ]);
  });
});
