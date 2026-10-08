import { describe, expect, it } from "vitest";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { analyticsEventItems } from "./event-items";

describe("analyticsEventItems", () => {
	it("normalizes item identity, SKU, price and quantity", () => {
		const event: PaperCommerceEvent = {
			name: "product_added_to_cart",
			channel: "us",
			value: 79,
			currency: "USD",
			items: [{
				itemId: " product-1 ",
				variantId: " variant-1 ",
				sku: " SKU-1 ",
				itemName: " Classic Sneaker ",
				price: 79,
				quantity: 2,
			}],
		};
		expect(analyticsEventItems(event)).toEqual([{
			itemId: "product-1",
			variantId: "variant-1",
			sku: "SKU-1",
			itemName: "Classic Sneaker",
			price: 79,
			quantity: 2,
		}]);
	});

	it("drops empty identities and removes control characters", () => {
		const event: PaperCommerceEvent = {
			name: "product_viewed",
			channel: "us",
			value: 10,
			currency: "USD",
			items: [
				{ itemId: " ", quantity: 1 },
				{ itemId: "v2", itemName: "Name\r\nwith controls", quantity: 1 },
			],
		};
		expect(analyticsEventItems(event)).toEqual([{
			itemId: "v2",
			variantId: null,
			sku: null,
			itemName: "Namewith controls",
			price: null,
			quantity: 1,
		}]);
	});

	it("bounds large item text and coerces non-positive quantities to one", () => {
		const event: PaperCommerceEvent = {
			name: "checkout_completed",
			channel: "us",
			transactionId: "order-1",
			value: 10,
			currency: "USD",
			items: [{
				itemId: "i".repeat(500),
				sku: "s".repeat(500),
				itemName: "n".repeat(500),
				quantity: 0,
			}],
		};
		const item = analyticsEventItems(event)[0];
		expect(item?.itemId).toHaveLength(300);
		expect(item?.sku).toHaveLength(200);
		expect(item?.itemName).toHaveLength(400);
		expect(item?.quantity).toBe(1);
	});
});
