import { type ApolloClient } from "@apollo/client";
import { type BulkPublishProductVariantsQuery } from "@dashboard/graphql";

import { fetchAllBulkPublishProductVariants } from "./fetchBulkPublishProductVariants";

const page = (
  start: number,
  count: number,
  hasNextPage = false,
  endCursor: string | null = null,
): BulkPublishProductVariantsQuery => ({
  __typename: "Query",
  product: {
    __typename: "Product",
    id: "p1",
    productVariants: {
      __typename: "ProductVariantCountableConnection",
      pageInfo: { __typename: "PageInfo", hasNextPage, endCursor },
      edges: Array.from({ length: count }, (_, index) => ({
        __typename: "ProductVariantCountableEdge",
        node: {
          __typename: "ProductVariant",
          id: `v${start + index}`,
          channelListings: [],
          stocks: [],
        },
      })),
    },
  },
});

describe("fetchAllBulkPublishProductVariants", () => {
  const query = jest.fn();
  const client: Pick<ApolloClient<object>, "query"> = { query };

  beforeEach(() => query.mockReset());

  it("collects exactly 500 variants only when the last page is complete", async () => {
    // Arrange
    for (let index = 0; index < 5; index += 1) {
      query.mockResolvedValueOnce({ data: page(index * 100, 100, index < 4, `c${index}`) });
    }

    // Act
    const variants = await fetchAllBulkPublishProductVariants(client, "p1");

    // Assert
    expect(variants).toHaveLength(500);
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[1][0].variables.after).toBe("c0");
  });

  it("rejects a list that still has more variants at the 500 limit", async () => {
    // Arrange
    for (let index = 0; index < 5; index += 1) {
      query.mockResolvedValueOnce({ data: page(index * 100, 100, true, `c${index}`) });
    }
    // Act / Assert
    await expect(fetchAllBulkPublishProductVariants(client, "p1")).rejects.toThrow("exceeds");
    expect(query).toHaveBeenCalledTimes(5);
  });

  it("rejects partial GraphQL data instead of returning the usable rows", async () => {
    // Arrange
    query.mockResolvedValueOnce({ data: page(0, 1), errors: [{ message: "missing stock" }] });
    // Act / Assert
    await expect(fetchAllBulkPublishProductVariants(client, "p1")).rejects.toThrow("Incomplete");
  });

  it("rejects duplicate identities across different cursors", async () => {
    // Arrange
    query.mockResolvedValueOnce({ data: page(0, 1, true, "a") });
    query.mockResolvedValueOnce({ data: page(0, 1, false, "b") });
    // Act / Assert
    await expect(fetchAllBulkPublishProductVariants(client, "p1")).rejects.toThrow("identity");
  });

  it("rejects multi-page cursor cycles", async () => {
    // Arrange
    query.mockResolvedValueOnce({ data: page(0, 1, true, "a") });
    query.mockResolvedValueOnce({ data: page(1, 1, true, "b") });
    query.mockResolvedValueOnce({ data: page(2, 1, true, "a") });
    // Act / Assert
    await expect(fetchAllBulkPublishProductVariants(client, "p1")).rejects.toThrow("cursor");
  });

  it.each([
    null,
    { __typename: "Product", id: "p1", productVariants: null },
    page(0, 0).product,
    page(0, 101).product,
  ])("rejects an absent, empty or oversized connection: %p", async product => {
    // Arrange
    query.mockResolvedValueOnce({ data: { __typename: "Query", product } });
    // Act / Assert
    await expect(fetchAllBulkPublishProductVariants(client, "p1")).rejects.toThrow();
  });
});
