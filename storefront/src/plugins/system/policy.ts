import type { SystemPluginId } from "./registry";

/** Only modules whose entry points enforce pause are configurable here. */
export const PAUSABLE_SYSTEM_PLUGINS = [
  "theme-builder", "payment-reminders", "customer-support", "ai-translations",
] as const satisfies readonly SystemPluginId[];
export type PausableSystemPluginId = (typeof PAUSABLE_SYSTEM_PLUGINS)[number];
export type SystemPluginPolicy = Readonly<{
  valid: boolean;
  disabled: readonly PausableSystemPluginId[];
}>;

/** Invalid settings stop optional work, never silently enable a misspelled plugin. */
export function parseSystemPluginPolicy(raw?: string): SystemPluginPolicy {
  if (!raw?.trim()) return { valid: true, disabled: [] };
  try {
    if (raw.length > 2048) throw new Error("oversized");
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids) || ids.length > PAUSABLE_SYSTEM_PLUGINS.length ||
      new Set(ids).size !== ids.length || ids.some(id =>
        typeof id !== "string" || !PAUSABLE_SYSTEM_PLUGINS.some(known => known === id))) {
      throw new Error("invalid");
    }
    return { valid: true, disabled: ids as PausableSystemPluginId[] };
  } catch {
    return { valid: false, disabled: PAUSABLE_SYSTEM_PLUGINS };
  }
}
export function systemPluginPauseReason(id: PausableSystemPluginId, policy: SystemPluginPolicy):
  "plugin_paused" | "plugin_configuration_invalid" | null {
  return !policy.valid ? "plugin_configuration_invalid" : policy.disabled.includes(id) ? "plugin_paused" : null;
}

/** All Ops authentication/role checks must run before applying this mutation guard. */
export function opsMutationPlugin(pathname: string, method: string): PausableSystemPluginId | null {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return null;
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { return null; }
  if (path === "/ops/themes" || path.startsWith("/ops/themes/")) return "theme-builder";
  if (path === "/ops/translations" || path.startsWith("/ops/translations/")) return "ai-translations";
  if (path === "/ops/api/analytics/reminders" || path.startsWith("/ops/api/analytics/reminders/")) return "payment-reminders";
  return null;
}
