/**
 * Internal static catalog, NOT a Saleor App Manifest.
 * Plugins are system-wide; no per-store installation, dynamic plugin scanning,
 * or database lookup on customer-facing pages.
 */
export type SystemPluginDefinition = Readonly<{
  id: string;
  apiVersion: 1;
  scope: "system";
  availability: "all-stores";
  integration: "storefront-module" | "partial" | "legacy-inline";
  capabilities: readonly string[];
}>;

export const SYSTEM_PLUGINS = {
  "theme-builder": {
    id: "theme-builder",
    apiVersion: 1,
    scope: "system",
    availability: "all-stores",
    integration: "storefront-module",
    capabilities: ["storefront.homepage", "ops.theme-editor"],
  },
  analytics: {
    id: "analytics",
    apiVersion: 1,
    scope: "system",
    availability: "all-stores",
    integration: "partial",
    capabilities: ["commerce.events", "ops.analytics"],
  },
  "ads-tracking": {
    id: "ads-tracking",
    apiVersion: 1,
    scope: "system",
    availability: "all-stores",
    integration: "partial",
    capabilities: ["marketing.browser-pixels", "marketing.server-events"],
  },
  "payment-reminders": {
    id: "payment-reminders",
    apiVersion: 1,
    scope: "system",
    availability: "all-stores",
    integration: "storefront-module",
    capabilities: ["ops.manual-reminders", "ops.automatic-reminders"],
  },
  "customer-support": {
    id: "customer-support",
    apiVersion: 1,
    scope: "system",
    availability: "all-stores",
    integration: "storefront-module",
    capabilities: ["storefront.chat", "ops.customer-support", "support.ai-agent-bot"],
  },
  "ai-translations": {
    id: "ai-translations",
    apiVersion: 1,
    scope: "system",
    availability: "all-stores",
    integration: "partial",
    capabilities: ["catalog.ai-translation-drafts", "catalog.translation-review-export", "ops.translation-queue", "ops.translation-review"],
  },
  "seo-merchant": {
    id: "seo-merchant",
    apiVersion: 1,
    scope: "system",
    availability: "all-stores",
    integration: "legacy-inline",
    capabilities: ["storefront.seo", "marketing.merchant-feed"],
  },
} as const satisfies Record<string, SystemPluginDefinition>;

export type SystemPluginId = keyof typeof SYSTEM_PLUGINS;

export function getSystemPlugin(id: SystemPluginId): (typeof SYSTEM_PLUGINS)[SystemPluginId] {
  return SYSTEM_PLUGINS[id];
}

/** For admin and diagnostics only, not for the customer purchase hot path. */
export function listSystemPlugins(): readonly SystemPluginDefinition[] {
  return Object.values(SYSTEM_PLUGINS);
}
