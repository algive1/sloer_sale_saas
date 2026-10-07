/**
 * Storefront commerce event catalog. Business components emit these semantic
 * moments once; destinations decide how to translate and store them.
 */
export const PAPER_COMMERCE_EVENT_VERSION = 3 as const;

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
	eventId?: string;
	items?: readonly CommerceItem[];
};

type MoneyContext = {
	value: number;
	currency: string;
};

type OptionalMoneyContext = {
	value?: number;
	currency?: string;
};

export type PaperCommerceEvent =
	| (EventContext & {
			name: "product_list_viewed";
			channel: string;
			listName: string;
	  })
	| (EventContext & OptionalMoneyContext & {
			name: "product_selected";
			channel: string;
			listName: string;
			position?: number;
	  })
	| (EventContext & MoneyContext & {
			name: "product_viewed";
			channel: string;
	  })
	| (EventContext & MoneyContext & {
			name: "wishlist_added" | "wishlist_removed";
			channel: string;
	  })
	| (EventContext & MoneyContext & {
			name: "product_added_to_cart";
			channel: string;
	  })
	| (EventContext & MoneyContext & {
			name: "cart_viewed" | "cart_item_removed";
			channel: string;
	  })
	| (EventContext & MoneyContext & {
			name: "cart_quantity_changed";
			channel: string;
			previousQuantity: number;
			newQuantity: number;
	  })
	| (EventContext & MoneyContext & {
			name: "checkout_started";
			channel: string;
	  })
	| (EventContext & OptionalMoneyContext & {
			name: "checkout_step_viewed";
			channel: string;
			step: CheckoutStepSlug;
	  })
	| (EventContext & OptionalMoneyContext & {
			name: "shipping_method_selected";
			channel: string;
			method: string;
	  })
	| (EventContext & OptionalMoneyContext & {
			name: "payment_method_selected";
			channel: string;
			method: string;
			wallet?: string;
	  })
	| (EventContext & OptionalMoneyContext & {
			name: "payment_failed";
			channel: string;
			provider?: string;
			code?: string;
			reason?: string;
	  })
	| (EventContext & {
			name: "checkout_failed";
			channel: string;
			stage: CheckoutStepSlug | "complete";
			reason?: string;
	  })
	| (EventContext & MoneyContext & {
			name: "checkout_completed";
			channel: string;
			transactionId: string;
	  })
	| (EventContext & MoneyContext & {
			name: "refund_completed";
			channel: string;
			transactionId: string;
	  })
	| (EventContext & {
			name: "search_submitted";
			channel: string;
			zero: boolean;
	  });
