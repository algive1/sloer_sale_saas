import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ db: null as DatabaseSync | null, failItem: false }));
vi.mock("server-only", () => ({}));
vi.mock("./saleor", () => ({
	listSourceProducts: vi.fn(),
	freshProduct: vi.fn(),
	publishProductTranslation: vi.fn(),
}));
vi.mock("@/lib/storage/libsql-http", async (original) => {
	const actual = await original<typeof import("@/lib/storage/libsql-http")>();
	const execute = (s: {
		sql: string;
		args?: Array<string | number | boolean | null>;
		wantRows?: boolean;
	}) => {
		if (state.failItem && s.sql.startsWith("INSERT INTO ops_translation_items") && s.args?.[1] === "p2")
			throw Error("injected item failure");
		const stmt = state.db!.prepare(s.sql),
			args = (s.args ?? []).map((v) => (typeof v === "boolean" ? Number(v) : v));
		if (!s.wantRows) return { cols: [], rows: [], affected_row_count: Number(stmt.run(...args).changes) };
		const names = stmt.columns().map((c) => c.name),
			rows = stmt.all(...args);
		return {
			cols: names.map((name) => ({ name })),
			rows: rows.map((r) =>
				names.map((n) =>
					r[n] === null
						? { type: "null" }
						: typeof r[n] === "number"
							? { type: "float", value: r[n] }
							: { type: "text", value: String(r[n]) },
				),
			),
			affected_row_count: 0,
		};
	};
	return {
		...actual,
		libsqlPipeline: vi.fn(async (s: Parameters<typeof actual.libsqlPipeline>[0]) => s.map(execute)),
		libsqlTransaction: vi.fn(async (s: Parameters<typeof actual.libsqlPipeline>[0]) => {
			state.db!.exec("BEGIN IMMEDIATE");
			try {
				const r = s.map(execute);
				state.db!.exec("COMMIT");
				return r;
			} catch (e) {
				state.db!.exec("ROLLBACK");
				throw e;
			}
		}),
	};
});
import { listSourceProducts } from "./saleor";
let store: typeof import("./store");
const scope = { siteId: "brand", channel: "default-channel", locale: "de" as const };
const products = ["p1", "p2"].map((id) => ({ id, slug: id, source: { name: id }, hash: id }));
beforeEach(async () => {
	vi.resetModules();
	state.db = new DatabaseSync(":memory:");
	state.failItem = false;
	vi.stubEnv("TRANSLATION_LIBSQL_URL", "https://db.example");
	vi.stubEnv("TRANSLATION_LIBSQL_AUTH_TOKEN", "test");
	vi.stubEnv("SYSTEM_PLUGINS_DISABLED", "");
	vi.mocked(listSourceProducts).mockReset().mockResolvedValue({ products, nextCursor: "next" });
	store = await import("./store");
});
afterEach(() => {
	state.db?.close();
	vi.unstubAllEnvs();
});
it("same scope concurrent reads create only one complete batch", async () => {
	let release!: () => void;
	const ready = new Promise<void>((r) => {
		release = r;
	});
	let calls = 0;
	vi.mocked(listSourceProducts).mockImplementation(async () => {
		if (++calls === 2) release();
		await ready;
		return { products, nextCursor: "next" };
	});
	const [a, b] = await Promise.all([store.createJob(scope, 2), store.createJob(scope, 2)]);
	expect(a.id).toBe(b.id);
	expect(a.total).toBe(2);
	expect(state.db!.prepare("SELECT count(*) n FROM ops_translation_jobs").get()!.n).toBe(1);
});
it("item failure rolls back job and cursor; retry retains all products", async () => {
	state.failItem = true;
	await expect(store.createJob(scope, 2)).rejects.toThrow("injected");
	expect(state.db!.prepare("SELECT count(*) n FROM ops_translation_jobs").get()!.n).toBe(0);
	state.failItem = false;
	const job = await store.createJob(scope, 2);
	expect(job.total).toBe(2);
	expect(vi.mocked(listSourceProducts).mock.calls.at(-1)?.[2]).toBe(null);
});
it("different scopes create separate batches", async () => {
	await Promise.all([store.createJob(scope, 2), store.createJob({ ...scope, locale: "fr" }, 2)]);
	expect(state.db!.prepare("SELECT count(*) n FROM ops_translation_jobs").get()!.n).toBe(2);
});
it("all expired processing versions fail; stale completion cannot overwrite retry", async () => {
	const job = await store.createJob(scope, 2);
	const item = await store.claimNext();
	expect(item).not.toBeNull();
	state
		.db!.prepare("UPDATE ops_translation_items SET revision=7,updated_at='2000-01-01' WHERE item_id='p1'")
		.run();
	state.db!.prepare("UPDATE ops_translation_items SET status='publishing' WHERE item_id='p2'").run();
	expect(await store.claimNext()).toBeNull();
	const detail = await store.getJob(scope.siteId, job.id);
	const failed = detail!.items.find((i) => i.itemId === "p1")!;
	expect(failed.status).toBe("failed");
	expect(failed.revision).toBe(8);
	expect(detail!.items.find((i) => i.itemId === "p2")!.status).toBe("publishing");
	await store.retryFailed(scope, job.id, "p1", 8);
	const retry = await store.claimNext();
	expect(await store.completeGenerated(item!, { name: "old" })).toBe(false);
	expect(await store.completeGenerated(retry!, { name: "new" })).toBe(true);
});
it("nonexpired processing and uncertain publication remain untouched", async () => {
	const job = await store.createJob(scope, 2);
	await store.claimNext();
	state
		.db!.prepare(
			"UPDATE ops_translation_items SET status='needs_reconciliation',updated_at='2000-01-01' WHERE item_id='p2'",
		)
		.run();
	expect(await store.claimNext()).toBeNull();
	const data = await store.getJob(scope.siteId, job.id);
	expect(data!.items.map((i) => i.status)).toEqual(["processing", "needs_reconciliation"]);
});
it("paused creation does not initialize storage", async () => {
	vi.stubEnv("SYSTEM_PLUGINS_DISABLED", '["ai-translations"]');
	await expect(store.createJob(scope, 2)).rejects.toThrow();
	expect(state.db!.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
});
