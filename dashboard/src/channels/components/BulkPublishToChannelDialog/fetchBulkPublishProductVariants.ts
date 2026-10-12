import { type ApolloClient, type ApolloQueryResult } from "@apollo/client";
import {
  BULK_PUBLISH_MAX_VARIANTS_PER_PRODUCT,
  BULK_PUBLISH_VARIANT_PAGE_SIZE,
} from "@dashboard/channels/components/BulkPublishToChannelDialog/types";
import {
  BulkPublishProductVariantsDocument,
  type BulkPublishProductVariantsQuery,
  type BulkPublishProductVariantsQueryVariables,
} from "@dashboard/graphql";

export type BulkPublishVariantNode = {
  id: string;
  channelListings: Array<{
    id: string;
    channel: { id: string };
    price: { amount: number } | null;
  }> | null;
  stocks: Array<{
    id: string;
    warehouse: { id: string };
  }> | null;
};

class BulkPublishVariantsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkPublishVariantsFetchError";
  }
}

const readVariantPage = async (
  client: Pick<ApolloClient<object>, "query">,
  variables: BulkPublishProductVariantsQueryVariables,
  timeout: number,
): Promise<ApolloQueryResult<BulkPublishProductVariantsQuery>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await client.query<BulkPublishProductVariantsQuery>({
      query: BulkPublishProductVariantsDocument,
      variables,
      fetchPolicy: "network-only",
      context: { fetchOptions: { signal: controller.signal } },
    });
  } finally {
    clearTimeout(timer);
  }
};

type VariantConnection = NonNullable<
  NonNullable<BulkPublishProductVariantsQuery["product"]>["productVariants"]
>;

const getCompleteVariantConnection = (
  result: ApolloQueryResult<BulkPublishProductVariantsQuery>,
  productId: string,
  maxPageSize: number,
): VariantConnection => {
  if (result.error || result.errors?.length) {
    throw new BulkPublishVariantsFetchError("Incomplete variant response");
  }

  const product = result.data?.product;

  if (!product || product.id !== productId) {
    throw new BulkPublishVariantsFetchError("Product not found while loading variants");
  }

  const connection = product.productVariants;

  if (
    !connection?.pageInfo ||
    !Array.isArray(connection.edges) ||
    connection.edges.length > maxPageSize
  ) {
    throw new BulkPublishVariantsFetchError("Incomplete variant connection");
  }

  return connection;
};

export const fetchAllBulkPublishProductVariants = async (
  apolloClient: Pick<ApolloClient<object>, "query">,
  productId: string,
): Promise<BulkPublishVariantNode[]> => {
  const collected: BulkPublishVariantNode[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  const cursors = new Set<string>();
  const variantIds = new Set<string>();
  const deadline = Date.now() + 45_000;

  while (hasNextPage && collected.length < BULK_PUBLISH_MAX_VARIANTS_PER_PRODUCT) {
    const remaining = BULK_PUBLISH_MAX_VARIANTS_PER_PRODUCT - collected.length;
    const timeRemaining = deadline - Date.now();

    if (timeRemaining <= 0) {
      throw new BulkPublishVariantsFetchError("Variant loading time limit exceeded");
    }

    const variables: BulkPublishProductVariantsQueryVariables = {
      id: productId,
      first: Math.min(BULK_PUBLISH_VARIANT_PAGE_SIZE, remaining),
      after,
    };
    const result = await readVariantPage(apolloClient, variables, Math.min(15_000, timeRemaining));

    const connection = getCompleteVariantConnection(result, productId, variables.first);
    const page = connection.edges.map(edge => edge.node);

    for (const variant of page) {
      if (!variant.id || variantIds.has(variant.id)) {
        throw new BulkPublishVariantsFetchError("Repeated or missing variant identity");
      }

      variantIds.add(variant.id);
    }

    collected.push(...page);

    hasNextPage = connection.pageInfo.hasNextPage;

    const nextAfter = connection?.pageInfo.endCursor;

    if (hasNextPage) {
      if (!nextAfter || cursors.has(nextAfter)) {
        throw new BulkPublishVariantsFetchError(
          "Pagination cursor did not advance while loading variants",
        );
      }

      if (page.length === 0) {
        throw new BulkPublishVariantsFetchError(
          "Empty page returned while more variants were expected",
        );
      }

      cursors.add(nextAfter);
    }

    after = nextAfter ?? null;
  }

  if (hasNextPage || collected.length === 0) {
    throw new BulkPublishVariantsFetchError("Variant list is empty or exceeds the wizard limit");
  }

  return collected;
};
