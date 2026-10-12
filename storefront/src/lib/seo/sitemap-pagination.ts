export type SitemapConnection<T> = {
	edges: Array<{ node: T }>;
	pageInfo: { hasNextPage: boolean; endCursor?: string | null };
};
/** Never publish a truncated success or loop forever on corrupt pagination. */
export async function collectSitemapConnection<T>(
	fetchPage: (after: string | null, timeoutMs: number) => Promise<SitemapConnection<T>>,
	key: (node: T) => string,
	limits = { pageSize: 100, maxPages: 500, budgetMs: 60_000, pageTimeoutMs: 8_000 },
): Promise<T[]> {
	const nodes: T[] = [];
	const cursors = new Set<string>();
	const keys = new Set<string>();
	const started = Date.now();
	let after: string | null = null;
	for (let count = 0; count < limits.maxPages; count++) {
		const remaining = limits.budgetMs - (Date.now() - started);
		if (remaining <= 0) throw new Error("sitemap_pagination_budget_exceeded");
		const page = await fetchPage(after, Math.min(limits.pageTimeoutMs, remaining));
		if (
			!page ||
			!Array.isArray(page.edges) ||
			page.edges.length > limits.pageSize ||
			typeof page.pageInfo?.hasNextPage !== "boolean"
		)
			throw new Error("sitemap_pagination_invalid");
		for (const edge of page.edges) {
			if (edge?.node == null) throw new Error("sitemap_pagination_invalid");
			const identity = key(edge.node);
			if (typeof identity !== "string" || !identity.trim() || keys.has(identity))
				throw new Error("sitemap_catalog_identity_invalid_or_repeated");
			keys.add(identity);
			nodes.push(edge.node);
		}
		if (!page.pageInfo.hasNextPage) return nodes;
		const cursor = page.pageInfo.endCursor;
		if (
			!page.edges.length ||
			typeof cursor !== "string" ||
			!cursor.trim() ||
			cursor.length > 1024 ||
			cursors.has(cursor)
		)
			throw new Error("sitemap_pagination_no_progress");
		cursors.add(cursor);
		after = cursor;
	}
	throw new Error("sitemap_catalog_requires_partitioning");
}
