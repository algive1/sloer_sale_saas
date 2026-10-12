import { cacheTag } from "next/cache";
import { applyCacheProfile, CACHE_PROFILES } from "@/lib/cache-manifest";
import { getGraphqlLanguageCode } from "@/config/locale";
import { executeRawGraphQL } from "@/lib/graphql";

export type SitemapEntity = "products" | "categories" | "collections";
export type SitemapPage = { slugs: string[]; rows: number; next: boolean; cursor: string | null };
type Node = {
	slug: string;
	translation?: { slug?: string | null } | null;
	products?: { totalCount?: number | null };
};

/** A single cached cursor page, never a complete catalog payload. */
export async function readSitemapPage(
	channel: string,
	locale: string,
	entity: SitemapEntity,
	after: string | null,
): Promise<SitemapPage> {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.sitemap, { channel });
	cacheTag("products", "categories", "collections");
	const channelArgument = entity === "categories" ? "" : ", channel: $channel";
	const categoryCount = entity === "categories" ? "products(first: 1, channel: $channel) { totalCount }" : "";
	const result = await executeRawGraphQL<{
		items?: { edges: Array<{ node: Node }>; pageInfo: { hasNextPage: boolean; endCursor?: string | null } };
	}>({
		query: `query SitemapCursorPage($channel: String!, $language: LanguageCodeEnum!, $after: String) {
			items: ${entity}(first: 100, after: $after${channelArgument}) {
				edges { node { slug translation(languageCode: $language) { slug } ${categoryCount} } }
				pageInfo { hasNextPage endCursor }
			}
		}`,
		variables: { channel, language: getGraphqlLanguageCode(locale), after },
		rejectPartialData: true,
		timeoutMs: 8_000,
	});
	if (!result.ok) throw new Error("sitemap_page_unavailable");
	const items = result.data.items;
	if (
		!items ||
		!Array.isArray(items.edges) ||
		items.edges.length > 100 ||
		typeof items.pageInfo?.hasNextPage !== "boolean"
	)
		throw new Error("sitemap_page_invalid");
	const slugs: string[] = [];
	const identities = new Set<string>();
	for (const { node } of items.edges) {
		if (!node || typeof node.slug !== "string" || !node.slug.trim()) throw new Error("sitemap_page_invalid");
		if (node.translation?.slug != null && typeof node.translation.slug !== "string")
			throw new Error("sitemap_page_invalid");
		const slug = node.translation?.slug?.trim() || node.slug;
		if (identities.has(slug)) throw new Error("sitemap_page_repeated_identity");
		identities.add(slug);
		if (entity === "categories") {
			const count = node.products?.totalCount;
			if (!Number.isSafeInteger(count) || count! < 0) throw new Error("sitemap_category_count_invalid");
			if (count === 0) continue;
		}
		slugs.push(slug);
	}
	const next = items.pageInfo.hasNextPage;
	const cursor = items.pageInfo.endCursor;
	if (
		next &&
		(!items.edges.length ||
			typeof cursor !== "string" ||
			!cursor.trim() ||
			cursor.length > 1024 ||
			cursor === after)
	)
		throw new Error("sitemap_page_no_progress");
	return { slugs, rows: items.edges.length, next, cursor: typeof cursor === "string" ? cursor : null };
}
