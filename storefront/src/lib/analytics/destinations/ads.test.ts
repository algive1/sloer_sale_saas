import { describe, expect, it } from "vitest";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { projectMeta, projectTikTok } from "./ads";

const purchase: PaperCommerceEvent = {
	name: "checkout_completed",
	eventId: "purchase:order-1",
	channel: "us",
	value: 59,
	currency: "USD",
	transactionId: "order-1",
	items: [{ itemId: "variant-1", itemName: "Shirt", price: 59, quantity: 1 }],
};

describe("advertising destination projections", () => {
	it("maps purchase to Meta with catalog ids", () => {
		expect(projectMeta(purchase)).toEqual({
			name: "Purchase",
			params: {
				value: 59,
				currency: "USD",
				content_type: "product",
				content_ids: ["variant-1"],
				contents: [{ id: "variant-1", quantity: 1, item_price: 59 }],
			},
		});
	});

	it("maps purchase to TikTok CompletePayment", () => {
		expect(projectTikTok(purchase)).toEqual({
			name: "CompletePayment",
			params: {
				value: 59,
				currency: "USD",
				content_type: "product",
				contents: [{ content_id: "variant-1", content_name: "Shirt", quantity: 1, price: 59 }],
			},
		});
	});

	it("only sends payment-step checkout_step_viewed to ad platforms", () => {
		expect(projectMeta({ name: "checkout_step_viewed", channel: "us", step: "shipping" })).toBeNull();
		expect(projectTikTok({ name: "checkout_step_viewed", channel: "us", step: "payment" })?.name).toBe(
			"AddPaymentInfo",
		);
	});
});
