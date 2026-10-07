import { getGraphqlLanguageCode } from "@/config/locale";
import { executeRawGraphQL } from "@/lib/graphql";

const PAGE_SIZE = 100;

type PageInfo = {
	hasNextPage: boolean;
	endCursor?: string | null;
};

type SlugNode = {
	slug: string;
	translation?: { slug?: string | null } | null;
};

type Connection<T> = {
	edges: Array<{ node: T }>;
	pageInfo: PageInfo;
};

type ProductNode = SlugNode;
type CategoryNode = SlugNode & {
	products?: { totalCount?: number | null } | null;
};
type CollectionNode = SlugNode;

function localizedSlug(node: SlugNode): string {
	return node.translation?.slug?.trim() || node.slug;
}

async function collectConnection<T>(
	fetchPage: (after: string | null) => Promise<Connection<T>>,
): Promise<T[]> {
	const nodes: T[] = [];
	let after: string | null = null;

	for (;;) {
		const page = await fetchPage(after);
		nodes.push(...page.edges.map((edge) => edge.node));

		if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) {
			break;
		}
		after = page.pageInfo.endCursor;
	}

	return nodes;
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
	const languageCode = getGraphqlLanguageCode(localeSlug);

	const [products, categories, collections] = await Promise.all([
		collectConnection<ProductNode>(async (after) => {
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
			});

			if (!result.ok || !result.data.products) {
				throw new Error(
					`[sitemap] Failed to fetch products for ${channel}: ${result.ok ? "missing connection" : result.error.message}`,
				);
			}
			return result.data.products;
		}),
		collectConnection<CategoryNode>(async (after) => {
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
			});

			if (!result.ok || !result.data.categories) {
				throw new Error(
					`[sitemap] Failed to fetch categories for ${channel}: ${result.ok ? "missing connection" : result.error.message}`,
				);
			}
			return result.data.categories;
		}),
		collectConnection<CollectionNode>(async (after) => {
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
			});

			if (!result.ok || !result.data.collections) {
				throw new Error(
					`[sitemap] Failed to fetch collections for ${channel}: ${result.ok ? "missing connection" : result.error.message}`,
				);
			}
			return result.data.collections;
		}),
	]);

	return {
		products: products.map(localizedSlug),
		categories: categories
			.filter((category) => (category.products?.totalCount ?? 0) > 0)
			.map(localizedSlug),
		collections: collections.map(localizedSlug),
	};
}
