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
				productId: undefined,
				categoryId: undefined,
				categoryName: undefined,
				imageUrl: undefined,
				variantId: "variant-1",
				sku: undefined,
				itemName: "Shirt — Large",
				price: 12.5,
				quantity: 2,
			},
		]);

    it("uses Saleor product ID for variant checkout attribution", () => {
        const result = commerceItemsFromLines([{
            id:"checkout-line",
            quantity:1,
            variant:{
                id:"variant-20",
                name:"Medium",
                product:{
                    id:"product-10",
                    name:"Shirt",
                    category:{id:"category-1", name:"Clothes"},
                    thumbnail:{url:"https://shop.example.com/thumb.webp"},
                },
            },
        }]);
        expect(result[0]).toMatchObject({
            itemId:"product-10",
            productId:"product-10",
            variantId:"variant-20",
            categoryId:"category-1",
            categoryName:"Clothes",
            imageUrl:"https://shop.example.com/thumb.webp",
        });
    });
});

