import { getGraphqlLanguageCode } from "@/config/locale";
import { executeRawGraphQL } from "@/lib/graphql";
import type {
	GoogleMerchantProduct,
	GoogleMerchantVariant,
	MerchantAttribute,
	MerchantVariantAttribute,
} from "@/lib/merchant/google-feed";

const PRODUCT_PAGE_SIZE = 50;
const VARIANT_PAGE_SIZE = 100;

type PageInfo = {
	hasNextPage: boolean;
	endCursor?: string | null;
};

type RawVariant = {
	id: string;
	name?: string | null;
	sku?: string | null;
	quantityAvailable?: number | null;
	translation?: { name?: string | null } | null;
	attributes?: MerchantVariantAttribute[] | null;
	media?: Array<{ url?: string | null }> | null;
	pricing?: {
		price?: {
			gross?: { amount?: number | null; currency?: string | null } | null;
		} | null;
	} | null;
};

type VariantConnection = {
	totalCount?: number | null;
	pageInfo: PageInfo;
	edges: Array<{ node: RawVariant }>;
};

type RawProduct = {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	seoDescription?: string | null;
	isAvailable?: boolean | null;
	translation?: {
		name?: string | null;
		slug?: string | null;
		description?: string | null;
		seoDescription?: string | null;
	} | null;
	thumbnail?: { url?: string | null } | null;
	media?: Array<{ url?: string | null }> | null;
	brand?: MerchantAttribute | null;
	googleProductCategory?: MerchantAttribute | null;
	gender?: MerchantAttribute | null;
	ageGroup?: MerchantAttribute | null;
	productVariants: VariantConnection;
};

type ProductConnection = {
	pageInfo: PageInfo;
	edges: Array<{ node: RawProduct }>;
};

const PRODUCT_FIELDS = `
	id
	name
	slug
	description
	seoDescription
	isAvailable
	translation(languageCode: $languageCode) {
		name
		slug
		description
		seoDescription
	}
	thumbnail(size: 1024, format: WEBP) { url }
	media { url(size: 1024, format: WEBP) }
	brand: assignedAttribute(slug: "brand") {
		... on AssignedPlainTextAttribute { text: value }
		... on AssignedSingleChoiceAttribute { choice: value { name slug } }
	}
	googleProductCategory: assignedAttribute(slug: "google-product-category") {
		... on AssignedPlainTextAttribute { text: value }
		... on AssignedSingleChoiceAttribute { choice: value { name slug } }
	}
	gender: assignedAttribute(slug: "gender") {
		... on AssignedPlainTextAttribute { text: value }
		... on AssignedSingleChoiceAttribute { choice: value { name slug } }
	}
	ageGroup: assignedAttribute(slug: "age-group") {
		... on AssignedPlainTextAttribute { text: value }
		... on AssignedSingleChoiceAttribute { choice: value { name slug } }
	}
	productVariants(first: ${VARIANT_PAGE_SIZE}) {
		totalCount
		pageInfo { hasNextPage endCursor }
		edges {
			node {
				${variantFields()}
			}
		}
	}
`;

function variantFields(): string {
	return `
		id
		name
		sku
		quantityAvailable
		translation(languageCode: $languageCode) { name }
		attributes {
			attribute { slug }
			values { name slug value }
		}
		media { url(size: 1024, format: WEBP) }
		pricing {
			price {
				gross { amount currency }
			}
		}
	`;
}

function mapVariant(variant: RawVariant): GoogleMerchantVariant {
	const gross = variant.pricing?.price?.gross;
	return {
		id: variant.id,
		name: variant.translation?.name?.trim() || variant.name,
		sku: variant.sku,
		quantityAvailable: variant.quantityAvailable,
		attributes: variant.attributes ?? [],
		imageUrl: variant.media?.[0]?.url ?? null,
		price:
			gross?.amount != null && gross.currency
				? { amount: gross.amount, currency: gross.currency }
				: null,
	};
}

async function fetchRemainingVariants(
	productSlug: string,
	channel: string,
	languageCode: string,
	firstPage: VariantConnection,
): Promise<RawVariant[]> {
	const variants = firstPage.edges.map((edge) => edge.node);
	let after = firstPage.pageInfo.endCursor ?? null;
	let hasNextPage = firstPage.pageInfo.hasNextPage;

	while (hasNextPage && after) {
		const result = await executeRawGraphQL<{
			product: { productVariants: VariantConnection } | null;
		}>({
			query: `
				query GoogleMerchantProductVariants(
					$slug: String!
					$channel: String!
					$languageCode: LanguageCodeEnum!
					$first: Int!
					$after: String
				) {
					product(slug: $slug, channel: $channel) {
						productVariants(first: $first, after: $after) {
							totalCount
							pageInfo { hasNextPage endCursor }
							edges {
								node {
									${variantFields()}
								}
							}
						}
					}
				}
			`,
			variables: {
				slug: productSlug,
				channel,
				languageCode,
				first: VARIANT_PAGE_SIZE,
				after,
			},
		});

		if (!result.ok || !result.data.product) {
			throw new Error(
				`[merchant] Failed to fetch variants for ${productSlug}: ${result.ok ? "missing product" : result.error.message}`,
			);
		}

		const page = result.data.product.productVariants;
		variants.push(...page.edges.map((edge) => edge.node));
		hasNextPage = page.pageInfo.hasNextPage;
		after = page.pageInfo.endCursor ?? null;
	}

	return variants;
}

async function mapProduct(
	product: RawProduct,
	channel: string,
	languageCode: string,
): Promise<GoogleMerchantProduct> {
	const variants =
		product.productVariants.pageInfo.hasNextPage
			? await fetchRemainingVariants(product.slug, channel, languageCode, product.productVariants)
			: product.productVariants.edges.map((edge) => edge.node);

	return {
		id: product.id,
		name: product.translation?.name?.trim() || product.name,
		slug: product.translation?.slug?.trim() || product.slug,
		description: product.translation?.description || product.description,
		seoDescription: product.translation?.seoDescription || product.seoDescription,
		isAvailable: product.isAvailable,
		imageUrl: product.thumbnail?.url || product.media?.[0]?.url || null,
		brand: product.brand,
		googleProductCategory: product.googleProductCategory,
		gender: product.gender,
		ageGroup: product.ageGroup,
		variants: variants.map(mapVariant),
	};
}

export async function fetchGoogleMerchantProducts(
	channel: string,
	localeSlug: string,
): Promise<GoogleMerchantProduct[]> {
	const languageCode = getGraphqlLanguageCode(localeSlug);
	const products: GoogleMerchantProduct[] = [];
	let after: string | null = null;

	for (;;) {
		const result = await executeRawGraphQL<{
			products: ProductConnection | null;
		}>({
			query: `
				query GoogleMerchantProducts(
					$channel: String!
					$languageCode: LanguageCodeEnum!
					$first: Int!
					$after: String
				) {
					products(first: $first, after: $after, channel: $channel) {
						pageInfo { hasNextPage endCursor }
						edges {
							node {
								${PRODUCT_FIELDS}
							}
						}
					}
				}
			`,
			variables: {
				channel,
				languageCode,
				first: PRODUCT_PAGE_SIZE,
				after,
			},
		});

		if (!result.ok || !result.data.products) {
			throw new Error(
				`[merchant] Failed to fetch products for ${channel}: ${result.ok ? "missing connection" : result.error.message}`,
			);
		}

		for (const edge of result.data.products.edges) {
			products.push(await mapProduct(edge.node, channel, languageCode));
		}

		if (!result.data.products.pageInfo.hasNextPage || !result.data.products.pageInfo.endCursor) {
			break;
		}
		after = result.data.products.pageInfo.endCursor;
	}

	return products;
}
