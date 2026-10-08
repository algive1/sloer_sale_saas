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
		return Number.isInteger(value)
			? { type: "integer", value: String(value) }
			: { type: "float", value };
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
