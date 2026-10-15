import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./store", () => ({ claimNext: vi.fn(), claimScope: vi.fn(), completeGenerated: vi.fn() }));
vi.mock("./policy", () => ({
	validateScope: (v: unknown) => v,
	parseTranslation: (_s: unknown, v: unknown) => v,
}));
import { claimNext, claimScope, completeGenerated } from "./store";
import { runTranslationWorker } from "./worker";
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("SYSTEM_PLUGINS_DISABLED", "");
	vi.stubEnv("TRANSLATION_AI_BASE_URL", "https://ai.example/v1");
	vi.stubEnv("TRANSLATION_AI_API_KEY", "test");
	vi.stubEnv("TRANSLATION_AI_MODEL", "test");
	vi.mocked(claimNext).mockResolvedValue({
		jobId: "job",
		itemId: "p",
		source: { name: "Hat" },
		revision: 1,
	} as Awaited<ReturnType<typeof claimNext>>);
	vi.mocked(claimScope).mockResolvedValue({ siteId: "brand", channel: "default-channel", locale: "de" });
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ choices: [{ message: { content: '{"name":"Hut"}' } }] })),
	);
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
it("does not report stale generation completion as processed", async () => {
	vi.mocked(completeGenerated).mockResolvedValue(false);
	expect(await runTranslationWorker()).toEqual({ processed: 0, failed: 0 });
});
it("reports completed generation", async () => {
	vi.mocked(completeGenerated).mockResolvedValue(true);
	expect(await runTranslationWorker()).toEqual({ processed: 1, failed: 0 });
});
it("does not report stale failure as processed or failed", async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.mocked(fetch).mockRejectedValue(Error("provider down"));
	vi.mocked(completeGenerated).mockResolvedValue(false);
	expect(await runTranslationWorker()).toEqual({ processed: 0, failed: 0 });
});
it("paused worker never claims or calls AI", async () => {
	vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '["ai-translations"]');
	expect(await runTranslationWorker()).toEqual({ processed: 0, failed: 0, reason: "plugin_paused" });
	expect(claimNext).not.toHaveBeenCalled();
	expect(fetch).not.toHaveBeenCalled();
});
