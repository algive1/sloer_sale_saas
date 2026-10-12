import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => vi.fn(() => { throw new Error("unexpected SQL while paused"); }));
vi.mock("@/lib/storage/libsql-http", async original => ({
  ...await original<typeof import("@/lib/storage/libsql-http")>(),
  analyticsDatabaseConfigured: () => true, libsqlPipeline: db,
}));
import { runQueuedAIBot, enqueueAIBotMessage } from "@/plugins/customer-support/ai/bot-runtime";
import type { AIConfig, BotBinding } from "@/plugins/customer-support/ai/bot-config";
import type { IncomingBotMessage } from "@/plugins/customer-support/ai/bot-policy";
import { runTranslationWorker } from "@/plugins/ai-translations/worker";
import { createJob, reviewItem, retryFailed, publishReviewed, claimNext } from "@/plugins/ai-translations/store";
import type { TranslationScope } from "@/plugins/ai-translations/policy";
import { reminderUnavailableReason, runAutomaticReminders, sendManualReminder, setReminderRule } from "@/plugins/payment-reminders/service";
import { saveTheme } from "@/plugins/theme-builder/store";
import { savePageTheme } from "@/plugins/theme-builder/pages-store";
import { saveNamedTemplate, deleteSavedTemplate } from "@/plugins/theme-builder/saved-templates";
import { PAUSABLE_SYSTEM_PLUGINS } from "./policy";
import { pluginPauseReason } from "./runtime.server";
import { storeFirstPartyCommerceEvent, recordRefundTotal } from "@/plugins/analytics/first-party-store";
import { deliverServerDestinations, deliverGa4ServerEvent } from "@/plugins/ads-tracking/server-ads";
import { claimAdDelivery } from "@/plugins/ads-tracking/delivery-store";
import { fetchGoogleMerchantProducts } from "@/lib/merchant/google-feed-source";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); db.mockClear(); });
it("paused workers and manual sends neither claim a queue nor contact providers/Saleor/SQL", async () => {
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", JSON.stringify(PAUSABLE_SYSTEM_PLUGINS));
  const network = vi.fn(() => { throw new Error("unexpected network while paused"); }); vi.stubGlobal("fetch", network);
  expect(await runQueuedAIBot({} as AIConfig)).toEqual({ processed: 0, remaining: null, reason: "plugin_paused" });
  expect(await runTranslationWorker()).toEqual({ processed: 0, failed: 0, reason: "plugin_paused" });
  expect(await sendManualReminder("native-order")).toEqual({ status: "skipped", reason: "plugin_paused" });
  expect(await runAutomaticReminders()).toMatchObject({ sent: 0, scanned: 0, reason: "plugin_paused" });
  expect(reminderUnavailableReason()).toBe("plugin_paused");
  expect(db).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});
it("data collection, provider delivery claims and native feed reads stop before SQL/network", async () => {
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '["analytics","ads-tracking","seo-merchant"]');
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  const event = { name: "product_added_to_cart", channel: "us", eventId: "id", value: 10, currency: "USD" } as PaperCommerceEvent;
  await storeFirstPartyCommerceEvent(event, new Headers());
  expect(await recordRefundTotal("order", 10, "USD")).toBe(0);
  await deliverServerDestinations(event, new Headers());
  await deliverGa4ServerEvent(event, new Headers(), "us");
  expect(await claimAdDelivery("site", "ga4", "G-ID", event.name, "us", "id")).toBe(false);
  await expect(fetchGoogleMerchantProducts("us", "en")).rejects.toThrow("plugin_paused");
  expect(db).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});
it("direct module writes reject pause before SQL/network, including replay/publish/template deletion", async () => {
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", JSON.stringify(PAUSABLE_SYSTEM_PLUGINS));
  const network = vi.fn(); vi.stubGlobal("fetch", network); const scope = {} as TranslationScope;
  const actions = [
    () => enqueueAIBotMessage({} as BotBinding, {} as IncomingBotMessage),
    () => setReminderRule({ enabled: true, firstAfterHours: 24, secondAfterHours: 72, dailyLimit: 5 }),
    () => createJob(scope, 1), () => claimNext(), () => reviewItem(scope, "id", "item", 0, "approve"),
    () => retryFailed(scope, "id", "item", 0), () => publishReviewed(scope, "id", "item", 0),
    () => saveTheme("us", "en", {}, true, 0), () => savePageTheme("us", "en", "product", "default", {}, true, 0),
    () => saveNamedTemplate("us", "en", "home", "Template", {}), () => deleteSavedTemplate("us", "en", "home", "id"),
  ];
  for (const action of actions) await expect(action()).rejects.toThrow("plugin_paused");
  expect(db).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});
it("reads current deployment policy rather than keeping a stale import-time snapshot", () => {
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '["payment-reminders"]'); expect(pluginPauseReason("payment-reminders")).toBe("plugin_paused");
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '[]'); expect(pluginPauseReason("payment-reminders")).toBeNull();
  vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '{'); expect(pluginPauseReason("theme-builder")).toBe("plugin_configuration_invalid");
});
