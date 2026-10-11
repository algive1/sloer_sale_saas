import { cacheLife, cacheTag } from "next/cache";
import { getGraphqlLanguageCode } from "@/config/locale";
import { executeRawGraphQL } from "@/lib/graphql";
import { collectSitemapConnection, type SitemapConnection } from "@/lib/seo/sitemap-pagination";

const PAGE_SIZE = 100;

type SlugNode = {
	slug: string;
	translation?: { slug?: string | null } | null;
};

type Connection<T> = SitemapConnection<T>;

type ProductNode = SlugNode;
type CategoryNode = SlugNode & {
	products?: { totalCount?: number | null } | null;
};
type CollectionNode = SlugNode;

function localizedSlug(node: SlugNode): string {
	return node.translation?.slug?.trim() || node.slug;
}

export type SitemapCatalogSlugs = {
	products: string[];
	categories: string[];
	collections: string[];
};

export async function fetchSitemapCatalogSlugs(
	channel: string,
	localeSlug: string,
): Promise<SitemapCatalogSlugs> {
	"use cache";
	cacheLife("catalog");
	cacheTag("products", "categories", "collections");

	const languageCode = getGraphqlLanguageCode(localeSlug);

	const [products, categories, collections] = await Promise.all([
		collectSitemapConnection<ProductNode>(async (after, timeoutMs) => {
			const result = await executeRawGraphQL<{
				products: Connection<ProductNode> | null;
			}>({
				query: `
					query SitemapProducts(
						$channel: String!
						$languageCode: LanguageCodeEnum!
						$first: Int!
						$after: String
					) {
						products(first: $first, after: $after, channel: $channel) {
							edges {
								node {
									slug
									translation(languageCode: $languageCode) { slug }
								}
							}
							pageInfo { hasNextPage endCursor }
						}
					}
				`,
				variables: { channel, languageCode, first: PAGE_SIZE, after },
				timeoutMs,
				rejectPartialData: true,
			});

			if (!result.ok || !result.data.products) {
				throw new Error(`[sitemap] Products unavailable for ${channel}`);
			}
			return result.data.products;
		}, localizedSlug),
		collectSitemapConnection<CategoryNode>(async (after, timeoutMs) => {
			const result = await executeRawGraphQL<{
				categories: Connection<CategoryNode> | null;
			}>({
				query: `
					query SitemapCategories(
						$channel: String!
						$languageCode: LanguageCodeEnum!
						$first: Int!
						$after: String
					) {
						categories(first: $first, after: $after) {
							edges {
								node {
									slug
									translation(languageCode: $languageCode) { slug }
									products(first: 1, channel: $channel) { totalCount }
								}
							}
							pageInfo { hasNextPage endCursor }
						}
					}
				`,
				variables: { channel, languageCode, first: PAGE_SIZE, after },
				timeoutMs,
				rejectPartialData: true,
			});

			if (!result.ok || !result.data.categories) {
				throw new Error(`[sitemap] Categories unavailable for ${channel}`);
			}
			return result.data.categories;
		}, localizedSlug),
		collectSitemapConnection<CollectionNode>(async (after, timeoutMs) => {
			const result = await executeRawGraphQL<{
				collections: Connection<CollectionNode> | null;
			}>({
				query: `
					query SitemapCollections(
						$channel: String!
						$languageCode: LanguageCodeEnum!
						$first: Int!
						$after: String
					) {
						collections(first: $first, after: $after, channel: $channel) {
							edges {
								node {
									slug
									translation(languageCode: $languageCode) { slug }
								}
							}
							pageInfo { hasNextPage endCursor }
						}
					}
				`,
				variables: { channel, languageCode, first: PAGE_SIZE, after },
				timeoutMs,
				rejectPartialData: true,
			});

			if (!result.ok || !result.data.collections) {
				throw new Error(`[sitemap] Collections unavailable for ${channel}`);
			}
			return result.data.collections;
		}, localizedSlug),
	]);

	return {
		products: products.map(localizedSlug),
		categories: categories.filter((category) => (category.products?.totalCount ?? 0) > 0).map(localizedSlug),
		collections: collections.map(localizedSlug),
	};
}
