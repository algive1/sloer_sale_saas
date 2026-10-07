/**
 * Paper commerce event catalog.
 *
 * Call sites emit one of these. Destinations project: Web Analytics gets two
 * flat props; merchant/ad destinations get platform-specific commerce payloads.
 * Never put track / tag / pixel calls in business components.
 */
export const PAPER_COMMERCE_EVENT_VERSION = 2 as const;

export type CheckoutStepSlug = "contact" | "shipping" | "payment";

export type CommerceItem = {
	itemId: string;
	itemName?: string;
	variantId?: string;
	sku?: string | null;
	price?: number;
	quantity: number;
};

type EventContext = {
	/** Shared across browser + server copies when deduplication is required. */
	eventId?: string;
	items?: readonly CommerceItem[];
};

export type PaperCommerceEvent =
	| (EventContext & {
			name: "product_viewed";
			channel: string;
			value: number;
			currency: string;
	  })
	| (EventContext & {
			name: "product_added_to_cart";
			channel: string;
			value: number;
			currency: string;
	  })
	| (EventContext & {
			name: "checkout_started";
			channel: string;
			value: number;
			currency: string;
	  })
	| (EventContext & {
			name: "checkout_step_viewed";
			channel: string;
			step: CheckoutStepSlug;
			value?: number;
			currency?: string;
	  })
	| (EventContext & {
			name: "checkout_completed";
			channel: string;
			value: number;
			currency: string;
			/** Saleor order id — transaction id for analytics + ad platforms. */
			transactionId: string;
	  })
	| (EventContext & {
			name: "search_submitted";
			channel: string;
			/** True when the result set is empty. Search text never leaves the browser. */
			zero: boolean;
	  });
