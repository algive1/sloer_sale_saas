import { describe, expect, it } from "vitest";
import type { PaperCommerceEvent } from "@/lib/analytics/catalog";
import { checkoutAnalyticsDimensions } from "./checkout-dimensions";

const base = { channel: "us" };

describe("checkoutAnalyticsDimensions", () => {
	it("stores checkout step progression", () => {
		const event: PaperCommerceEvent = {
			...base,
			name: "checkout_step_viewed",
			step: "shipping",
		};
		expect(checkoutAnalyticsDimensions(event)).toEqual({
			checkoutStage: "shipping",
			method: null,
			provider: null,
			errorCode: null,
			failureReason: null,
		});
	});

	it("stores the selected shipping and payment methods", () => {
		expect(
			checkoutAnalyticsDimensions({
				...base,
				name: "shipping_method_selected",
				method: "  Express International  ",
			}),
		).toMatchObject({ method: "Express International" });

		expect(
			checkoutAnalyticsDimensions({
				...base,
				name: "payment_method_selected",
				method: "Stripe Card",
			}),
		).toMatchObject({ method: "Stripe Card" });
	});

	it("stores sanitized payment failure diagnostics", () => {
		const result = checkoutAnalyticsDimensions({
			...base,
			name: "payment_failed",
			provider: " stripe ",
			code: " card_declined ",
			reason: "Issuer declined\r\nretry",
		});
		expect(result).toEqual({
			checkoutStage: null,
			method: null,
			provider: "stripe",
			errorCode: "card_declined",
			failureReason: "Issuer declinedretry",
		});
	});

	it("stores checkout failure stage and reason", () => {
		const result = checkoutAnalyticsDimensions({
			...base,
			name: "checkout_failed",
			stage: "complete",
			reason: "Inventory changed",
		});
		expect(result.checkoutStage).toBe("complete");
		expect(result.failureReason).toBe("Inventory changed");
	});

	it("clips diagnostic strings to bounded lengths", () => {
		const result = checkoutAnalyticsDimensions({
			...base,
			name: "payment_failed",
			provider: "p".repeat(200),
			code: "c".repeat(200),
			reason: "r".repeat(400),
		});
		expect(result.provider).toHaveLength(120);
		expect(result.errorCode).toHaveLength(120);
		expect(result.failureReason).toHaveLength(300);
	});

	it("does not populate checkout diagnostics for unrelated events", () => {
		const event: PaperCommerceEvent = {
			...base,
			name: "page_viewed",
			path: "/en/us",
		};
		expect(checkoutAnalyticsDimensions(event)).toEqual({
			checkoutStage: null,
			method: null,
			provider: null,
			errorCode: null,
			failureReason: null,
		});
	});
});
