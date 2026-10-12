import type * as ApolloModule from "@apollo/client";
import type * as GraphQLModule from "@dashboard/graphql";
import { act, renderHook } from "@testing-library/react";

import { type BulkPublishVariantNode } from "./fetchBulkPublishProductVariants";
import { type BulkPublishDefaults, type ProductPublishDraft } from "./types";
import { useBulkPublishToChannelSubmit } from "./useBulkPublishToChannelSubmit";

const mockReadProducts = jest.fn();
const mockReadVariants = jest.fn();
const mockUpdateListing = jest.fn();
const mockUpdateVariants = jest.fn();
const mockNotify = jest.fn();
const mockTrack = jest.fn();

jest.mock("@apollo/client", () => ({
  ...jest.requireActual<typeof ApolloModule>("@apollo/client"),
  useApolloClient: (): object => ({}),
}));
jest.mock("@dashboard/graphql", () => ({
  ...jest.requireActual<typeof GraphQLModule>("@dashboard/graphql"),
  useBulkPublishProductsDataQuery: (): { refetch: jest.Mock } => ({ refetch: mockReadProducts }),
  useProductChannelListingUpdateMutation: (): jest.Mock[] => [mockUpdateListing],
  useProductVariantBulkUpdateMutation: (): jest.Mock[] => [mockUpdateVariants],
}));
jest.mock("./fetchBulkPublishProductVariants", () => ({
  fetchAllBulkPublishProductVariants: (): Promise<BulkPublishVariantNode[]> => mockReadVariants(),
}));
jest.mock("@dashboard/hooks/useNotifier/useNotifier", () => ({
  useNotifier: (): jest.Mock => mockNotify,
}));
jest.mock("@dashboard/components/ProductAnalytics/useAnalytics", () => ({
  useAnalytics: (): { trackEvent: jest.Mock } => ({ trackEvent: mockTrack }),
}));

const defaults: BulkPublishDefaults = {
  isPublished: true,
  visibleInListings: true,
  isAvailableForPurchase: true,
  stock: { enabled: false, defaultQuantity: "", warehouseScope: "all_channel", warehouseId: "" },
};
const draft: ProductPublishDraft = {
  productId: "p1",
  name: "Product",
  variantCount: 101,
  exceedsVariantLimit: false,
  hasManyVariants: true,
  hasCategory: true,
  alreadyInChannel: true,
  price: "20",
  costPrice: "",
  stock: "",
};
const variants: BulkPublishVariantNode[] = Array.from({ length: 101 }, (_, index) => ({
  id: `v${index}`,
  channelListings: [],
  stocks: [],
}));
const products = (
  assigned: boolean,
): ApolloModule.FetchResult<GraphQLModule.BulkPublishProductsDataQuery> => ({
  data: {
    __typename: "Query",
    products: {
      __typename: "ProductCountableConnection",
      edges: [
        {
          __typename: "ProductCountableEdge",
          node: {
            __typename: "Product",
            id: "p1",
            name: "Product",
            category: { __typename: "Category", id: "cat1" },
            channelListings: assigned
              ? [
                  {
                    __typename: "ProductChannelListing",
                    channel: { __typename: "Channel", id: "ch1" },
                  },
                ]
              : [],
            productVariants: {
              __typename: "ProductVariantCountableConnection",
              totalCount: 101,
              edges: [],
            },
          },
        },
      ],
    },
  },
});
const listingSuccess: ApolloModule.FetchResult<GraphQLModule.ProductChannelListingUpdateMutation> =
  {
    data: {
      __typename: "Mutation",
      productChannelListingUpdate: {
        __typename: "ProductChannelListingUpdate",
        errors: [],
        product: null,
      },
    },
  };
const variantSuccess = (
  count: number,
): ApolloModule.FetchResult<GraphQLModule.ProductVariantBulkUpdateMutation> => ({
  data: {
    __typename: "Mutation",
    productVariantBulkUpdate: {
      __typename: "ProductVariantBulkUpdate",
      errors: [],
      results: Array.from({ length: count }, () => ({
        __typename: "ProductVariantBulkResult",
        errors: [],
      })),
    },
  },
});

describe("bulk publish publication safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadProducts.mockReset().mockResolvedValue(products(true));
    mockReadVariants.mockReset().mockResolvedValue(variants);
    mockUpdateListing.mockReset().mockResolvedValue(listingSuccess);
    mockUpdateVariants
      .mockReset()
      .mockImplementation(({ variables }: { variables: { input: unknown[] } }) =>
        Promise.resolve(variantSuccess(variables.input.length)),
      );
  });

  const publish = async (
    productDraft: ProductPublishDraft = draft,
  ): Promise<{ failedProductIds: string[] } | undefined> => {
    const { result } = renderHook(() =>
      useBulkPublishToChannelSubmit({
        channel: { id: "ch1", name: "US", slug: "us", currencyCode: "USD" },
        channelWarehouses: [],
      }),
    );
    let outcome: { failedProductIds: string[] } | undefined;

    await act(async () => {
      outcome = await result.current.publishProducts({
        productDrafts: [productDraft],
        defaults,
        productIds: ["p1"],
        onProgressChange: jest.fn(),
      });
    });

    return outcome;
  };

  it("never changes publication when complete variant loading fails", async () => {
    // Arrange
    mockReadVariants.mockRejectedValueOnce(new Error("501 variants"));

    // Act
    const outcome = await publish();

    // Assert
    expect(outcome).toEqual({ failedProductIds: ["p1"] });
    expect(mockUpdateListing).not.toHaveBeenCalled();
    expect(mockUpdateVariants).not.toHaveBeenCalled();
  });

  it("preserves an existing publication state when a later variant chunk fails", async () => {
    // Arrange
    mockUpdateVariants.mockResolvedValueOnce(variantSuccess(100)).mockResolvedValueOnce({
      data: {
        productVariantBulkUpdate: { errors: [], results: [{ errors: [{ message: "bad row" }] }] },
      },
    });

    // Act
    const outcome = await publish();

    // Assert
    expect(outcome).toEqual({ failedProductIds: ["p1"] });
    expect(mockUpdateVariants).toHaveBeenCalledTimes(2);
    expect(mockUpdateListing).not.toHaveBeenCalled();
  });

  it("keeps a new assignment unpublished when variant writing fails", async () => {
    // Arrange
    mockReadProducts.mockResolvedValueOnce(products(false));
    mockUpdateVariants.mockRejectedValueOnce(new Error("lost response"));

    // Act
    const outcome = await publish({ ...draft, alreadyInChannel: false });

    // Assert
    expect(outcome).toEqual({ failedProductIds: ["p1"] });
    expect(mockUpdateListing).toHaveBeenCalledTimes(1);
    expect(mockUpdateListing.mock.calls[0][0].variables.input.updateChannels).toEqual([
      {
        channelId: "ch1",
        isPublished: false,
        visibleInListings: false,
        isAvailableForPurchase: false,
      },
    ]);
  });

  it("publishes only after every chunk succeeds", async () => {
    // Arrange
    mockReadProducts.mockResolvedValueOnce(products(false));

    // Act
    const outcome = await publish({ ...draft, alreadyInChannel: false });

    // Assert
    expect(outcome).toEqual({ failedProductIds: [] });
    expect(mockUpdateVariants).toHaveBeenCalledTimes(2);
    expect(mockUpdateListing).toHaveBeenCalledTimes(2);
    expect(mockUpdateListing.mock.calls[1][0].variables.input.updateChannels[0].isPublished).toBe(
      true,
    );
    expect(mockUpdateListing.mock.invocationCallOrder[1]).toBeGreaterThan(
      mockUpdateVariants.mock.invocationCallOrder[1],
    );
  });

  it("does not report success when the final publication write fails", async () => {
    // Arrange
    mockUpdateListing.mockResolvedValueOnce({
      data: {
        productChannelListingUpdate: {
          errors: [
            {
              code: "INVALID",
              field: "isPublished",
              message: "refused",
            },
          ],
        },
      },
    });

    // Act
    const outcome = await publish();

    // Assert
    expect(outcome).toEqual({ failedProductIds: ["p1"] });
  });

  it("rejects partial product data before any writes", async () => {
    // Arrange
    mockReadProducts.mockResolvedValueOnce({
      ...products(true),
      errors: [{ message: "partial listing" }],
    });

    // Act
    const outcome = await publish();

    // Assert
    expect(outcome).toEqual({ failedProductIds: ["p1"] });
    expect(mockReadVariants).not.toHaveBeenCalled();
    expect(mockUpdateListing).not.toHaveBeenCalled();
  });

  it("requires a price if the channel assignment disappeared since review", async () => {
    // Arrange
    mockReadProducts.mockResolvedValueOnce(products(false));

    // Act
    const outcome = await publish({ ...draft, price: "" });

    // Assert
    expect(outcome).toEqual({ failedProductIds: ["p1"] });
    expect(mockUpdateListing).not.toHaveBeenCalled();
    expect(mockUpdateVariants).not.toHaveBeenCalled();
  });

  it("rejects a successful-looking response that omits variant receipts", async () => {
    // Arrange
    mockUpdateVariants.mockResolvedValueOnce(variantSuccess(99));

    // Act
    const outcome = await publish();

    // Assert
    expect(outcome).toEqual({ failedProductIds: ["p1"] });
    expect(mockUpdateListing).not.toHaveBeenCalled();
    expect(mockUpdateVariants).toHaveBeenCalledTimes(1);
  });
});
