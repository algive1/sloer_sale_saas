import { expect, it } from "vitest";
import { opsMutationPlugin, PAUSABLE_SYSTEM_PLUGINS, parseSystemPluginPolicy, systemPluginPauseReason } from "./policy";
it("keeps optional plugins active by default and supports a selective system pause", () => {
  expect(parseSystemPluginPolicy()).toEqual({ valid: true, disabled: [] });
  const policy = parseSystemPluginPolicy('["payment-reminders"]');
  expect(systemPluginPauseReason("payment-reminders", policy)).toBe("plugin_paused");
  expect(systemPluginPauseReason("theme-builder", policy)).toBeNull();
});
it("fails closed for typos, unknown modules, duplicates, malformed and oversized settings", () => {
  for (const raw of ['{}', 'false', '["unknown"]', '["payment-reminder"]', '["theme-builder","theme-builder"]', '[', ' '.repeat(2049) + '[]']) {
    const policy = parseSystemPluginPolicy(raw);
    expect(policy.valid).toBe(false); expect(policy.disabled).toEqual(PAUSABLE_SYSTEM_PLUGINS);
    expect(systemPluginPauseReason("customer-support", policy)).toBe("plugin_configuration_invalid");
  }
});
it("blocks only matching Ops mutations and retains historical reads and core commerce routes", () => {
  expect(opsMutationPlugin("/ops/themes/ai/images/generate", "POST")).toBe("theme-builder");
  expect(opsMutationPlugin("/ops/%74hemes/pages/api", "POST")).toBe("theme-builder");
  expect(opsMutationPlugin("/ops/translations/api", "POST")).toBe("ai-translations");
  expect(opsMutationPlugin("/ops/api/analytics/reminders/manual", "POST")).toBe("payment-reminders");
  for (const path of ["/checkout", "/api/payment", "/ops/themes-other/api", "/ops/sites/fashion/fulfillment/api"]) expect(opsMutationPlugin(path, "POST")).toBeNull();
  for (const method of ["GET", "HEAD", "OPTIONS"]) expect(opsMutationPlugin("/ops/themes/api", method)).toBeNull();
});
