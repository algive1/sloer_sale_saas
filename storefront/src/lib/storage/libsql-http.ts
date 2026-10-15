import "server-only";

type LibsqlScalar = null | string | number | boolean;
type HranaValue =
	| { type: "null" }
	| { type: "integer"; value: string }
	| { type: "float"; value: number }
	| { type: "text"; value: string };

type Statement = { sql: string; args?: LibsqlScalar[]; wantRows?: boolean };

type HranaExecuteResult = {
	cols: Array<{ name: string | null }>;
	rows: HranaValue[][];
	affected_row_count?: number;
};

type PipelineResponse = {
	results: Array<
		| { type: "ok"; response: { type: "execute"; result: HranaExecuteResult } | { type: string } }
		| { type: "error"; error: { message: string; code?: string | null } }
	>;
};

export function analyticsDatabaseConfigured(): boolean {
	return Boolean(process.env.ANALYTICS_LIBSQL_URL?.trim() && process.env.ANALYTICS_LIBSQL_AUTH_TOKEN?.trim());
}

export async function libsqlPipeline(
	statements: readonly Statement[],
	connection?: { url: string; token: string },
): Promise<HranaExecuteResult[]> {
	const rawUrl = connection?.url ?? process.env.ANALYTICS_LIBSQL_URL?.trim();
	const token = connection?.token ?? process.env.ANALYTICS_LIBSQL_AUTH_TOKEN?.trim();
	if (!rawUrl || !token) return [];

	const baseUrl = rawUrl.replace(/^libsql:/, "https:").replace(/\/$/, "");
	const response = await fetch(`${baseUrl}/v3/pipeline`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			baton: null,
			requests: [
				...statements.map((statement) => ({
					type: "execute",
					stmt: {
						sql: statement.sql,
						args: (statement.args ?? []).map(toHranaValue),
						want_rows: statement.wantRows ?? false,
					},
				})),
				{ type: "close" },
			],
		}),
		cache: "no-store",
		signal: AbortSignal.timeout(3_000),
	});

	if (!response.ok) {
		throw new Error(`Analytics database HTTP ${response.status}`);
	}

	const body = (await response.json()) as PipelineResponse;
	const output: HranaExecuteResult[] = [];
	for (const result of body.results) {
		if (result.type === "error") {
			throw new Error(`Analytics database: ${result.error.message}`);
		}
		if (result.response.type === "execute" && "result" in result.response) {
			output.push(result.response.result);
		}
	}
	return output;
}

/** Atomic Hrana batch: a failed or skipped step can never reach COMMIT. */
export async function libsqlTransaction(
	statements: readonly Statement[],
	connection: { url: string; token: string },
): Promise<HranaExecuteResult[]> {
	if (!statements.length || !connection.url.trim() || !connection.token.trim())
		throw new Error("Invalid database transaction");
	const steps = [
		{ stmt: { sql: "BEGIN IMMEDIATE", args: [], want_rows: false } },
		...statements.map((statement, index) => ({
			condition: { type: "ok", step: index },
			stmt: {
				sql: statement.sql,
				args: (statement.args ?? []).map(toHranaValue),
				want_rows: statement.wantRows ?? false,
			},
		})),
		{
			condition: { type: "ok", step: statements.length },
			stmt: { sql: "COMMIT", args: [], want_rows: false },
		},
		{
			condition: { type: "not", cond: { type: "is_autocommit" } },
			stmt: { sql: "ROLLBACK", args: [], want_rows: false },
		},
	];
	const base = connection.url.replace(/^libsql:/, "https:").replace(/\/$/, "");
	const response = await fetch(`${base}/v3/pipeline`, {
		method: "POST",
		headers: { authorization: `Bearer ${connection.token}`, "content-type": "application/json" },
		body: JSON.stringify({ baton: null, requests: [{ type: "batch", batch: { steps } }, { type: "close" }] }),
		cache: "no-store",
		signal: AbortSignal.timeout(3_000),
	});
	if (!response.ok) throw new Error(`Database transaction HTTP ${response.status}`);
	const body = (await response.json()) as {
		results?: Array<{
			type?: string;
			response?: {
				type?: string;
				result?: {
					step_results?: Array<HranaExecuteResult | null>;
					step_errors?: Array<unknown>;
				};
			};
		}>;
	};
	const batch = body?.results?.[0];
	const close = body?.results?.[1];
	const result = batch?.response?.result;
	if (
		body?.results?.length !== 2 ||
		batch?.type !== "ok" ||
		batch.response?.type !== "batch" ||
		close?.type !== "ok" ||
		close.response?.type !== "close" ||
		!Array.isArray(result?.step_results) ||
		!Array.isArray(result?.step_errors) ||
		result.step_results.length !== steps.length ||
		result.step_errors.length !== steps.length ||
		result.step_errors.some((error) => error !== null) ||
		result.step_results
			.slice(0, -1)
			.some(
				(value) =>
					!value ||
					!Array.isArray(value.cols) ||
					!Array.isArray(value.rows) ||
					typeof value.affected_row_count !== "number",
			) ||
		result.step_results.at(-1) !== null
	)
		throw new Error("Database transaction failed or response incomplete");
	return result.step_results.slice(1, -2) as HranaExecuteResult[];
}

export function hranaRowsToObjects(result: HranaExecuteResult | undefined): Array<Record<string, unknown>> {
	if (!result) return [];
	const names = result.cols.map((col, index) => col.name ?? `col_${index}`);
	return result.rows.map((row) =>
		Object.fromEntries(row.map((value, index) => [names[index], fromHranaValue(value)])),
	);
}

function toHranaValue(value: LibsqlScalar): HranaValue {
	if (value === null) return { type: "null" };
	if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
	if (typeof value === "number") {
		return Number.isInteger(value) ? { type: "integer", value: String(value) } : { type: "float", value };
	}
	return { type: "text", value };
}

function fromHranaValue(value: HranaValue): unknown {
	switch (value.type) {
		case "null":
			return null;
		case "integer":
			return Number(value.value);
		case "float":
			return value.value;
		case "text":
			return value.value;
	}
}
