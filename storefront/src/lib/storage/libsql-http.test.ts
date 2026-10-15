import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { libsqlTransaction } from "./libsql-http";
let db: DatabaseSync;
let failCommit = false;
let failBegin = false;
let mutate: (body: Record<string, unknown>) => void = () => {};
let calls: string[];
type Condition = { type: string; step?: number; cond?: Condition };
beforeEach(() => {
	db = new DatabaseSync(":memory:");
	db.exec("CREATE TABLE data (id INTEGER PRIMARY KEY)");
	calls = [];
	failCommit = false;
	failBegin = false;
	mutate = () => {};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url, init) => {
			const request = JSON.parse(String(init.body)) as {
				requests: Array<{
					batch: {
						steps: Array<{
							condition?: Condition;
							stmt: { sql: string; args: Array<{ type: string; value?: string | number }> };
						}>;
					};
				}>;
			};
			const steps = request.requests[0].batch.steps;
			const results: Array<object | null> = [],
				errors: Array<object | null> = [];
			const condition = (c: Condition): boolean =>
				c.type === "ok"
					? results[c.step!] !== null
					: c.type === "not"
						? !condition(c.cond!)
						: c.type === "is_autocommit"
							? !db.isTransaction
							: false;
			for (const step of steps) {
				if (step.condition && !condition(step.condition)) {
					results.push(null);
					errors.push(null);
					continue;
				}
				calls.push(step.stmt.sql);
				try {
					if (
						(failCommit && step.stmt.sql === "COMMIT") ||
						(failBegin && step.stmt.sql === "BEGIN IMMEDIATE")
					)
						throw Error("injected");
					const args = step.stmt.args.map((v: { type: string; value?: string | number }) =>
						v.type === "null" ? null : v.type === "integer" ? Number(v.value) : (v.value ?? null),
					);
					const result = db.prepare(step.stmt.sql).run(...args);
					results.push({ cols: [], rows: [], affected_row_count: Number(result.changes) });
					errors.push(null);
				} catch (e) {
					results.push(null);
					errors.push({ message: String(e) });
				}
			}
			const body = {
				results: [
					{ type: "ok", response: { type: "batch", result: { step_results: results, step_errors: errors } } },
					{ type: "ok", response: { type: "close" } },
				],
			};
			mutate(body);
			return Response.json(body);
		}),
	);
});
afterEach(() => {
	db.close();
	vi.unstubAllGlobals();
});
const connection = { url: "libsql://db.example", token: "test" };
it("commits a complete batch in one request", async () => {
	const result = await libsqlTransaction(
		[
			{ sql: "INSERT INTO data VALUES (?)", args: [1] },
			{ sql: "INSERT INTO data VALUES (?)", args: [2] },
		],
		connection,
	);
	expect(result.map((r) => r.affected_row_count)).toEqual([1, 1]);
	expect(db.prepare("SELECT count(*) n FROM data").get()!.n).toBe(2);
	expect(calls).toEqual([
		"BEGIN IMMEDIATE",
		"INSERT INTO data VALUES (?)",
		"INSERT INTO data VALUES (?)",
		"COMMIT",
	]);
	expect(fetch).toHaveBeenCalledTimes(1);
});
it("middle failure rolls back and skips later writes and commit", async () => {
	await expect(
		libsqlTransaction(
			[
				{ sql: "INSERT INTO data VALUES (1)" },
				{ sql: "INSERT INTO data VALUES (1)" },
				{ sql: "INSERT INTO data VALUES (2)" },
			],
			connection,
		),
	).rejects.toThrow();
	expect(calls.at(-1)).toBe("ROLLBACK");
	expect(calls).not.toContain("COMMIT");
	expect(calls).not.toContain("INSERT INTO data VALUES (2)");
	expect(db.prepare("SELECT * FROM data").all()).toEqual([]);
	expect(db.isTransaction).toBe(false);
});
it("commit failure rolls back", async () => {
	failCommit = true;
	await expect(libsqlTransaction([{ sql: "INSERT INTO data VALUES (1)" }], connection)).rejects.toThrow();
	expect(calls.at(-1)).toBe("ROLLBACK");
	expect(db.prepare("SELECT * FROM data").all()).toEqual([]);
});
it("begin failure skips writes and avoids rollback outside transaction", async () => {
	failBegin = true;
	await expect(libsqlTransaction([{ sql: "INSERT INTO data VALUES (1)" }], connection)).rejects.toThrow();
	expect(calls).toEqual(["BEGIN IMMEDIATE"]);
});
it.each(["missing-results", "truncated", "missing-close", "skipped-commit", "bad-result"])(
	"rejects malformed successful HTTP response: %s",
	async (mode) => {
		mutate = (body) => {
			const responses = body.results as Array<{ response: { result?: { step_results: Array<unknown> } } }>;
			if (mode === "missing-results") delete body.results;
			if (mode === "truncated") responses[0].response.result!.step_results.pop();
			if (mode === "missing-close") responses.pop();
			if (mode === "skipped-commit") responses[0].response.result!.step_results[2] = null;
			if (mode === "bad-result") responses[0].response.result!.step_results[1] = {};
		};
		await expect(libsqlTransaction([{ sql: "INSERT INTO data VALUES (1)" }], connection)).rejects.toThrow(
			"response incomplete",
		);
	},
);
