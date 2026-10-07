import { describe, expect, it } from "vitest";
import { commerceItemsFromLines } from "./items";

describe("commerceItemsFromLines", () => {
	it("normalizes checkout/order lines without customer data", () => {
		expect(
			commerceItemsFromLines([
				{
					id: "line-1",
					quantity: 2,
					unitPrice: { gross: { amount: 12.5 } },
					variant: { id: "variant-1", name: "Large", product: { name: "Shirt" } },
				},
			]),
		).toEqual([
			{
				itemId: "variant-1",
				variantId: "variant-1",
				sku: undefined,
				itemName: "Shirt — Large",
				price: 12.5,
				quantity: 2,
			},
		]);
	});
});
