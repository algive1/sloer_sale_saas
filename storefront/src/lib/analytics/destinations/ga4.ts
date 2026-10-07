import type { CommerceItem, PaperCommerceEvent } from "@/lib/analytics/catalog";

export type Ga4Event = {
	name: string;
	params: Record<string, unknown>;
};

function gaItems(items: readonly CommerceItem[] | undefined): Array<Record<string, unknown>> | undefined {
	if (!items?.length) return undefined;
	return items.map((item) => ({
		item_id: item.itemId,
		...(item.itemName ? { item_name: item.itemName } : {}),
		...(item.variantId ? { item_variant: item.variantId } : {}),
		...(item.sku ? { item_category: item.sku } : {}),
		...(typeof item.price === "number" ? { price: item.price } : {}),
		quantity: item.quantity,
	}));
}

function commerceParams(event: PaperCommerceEvent): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	if ("currency" in event && event.currency) params.currency = event.currency;
	if ("value" in event && typeof event.value === "number") params.value = event.value;
	const items = gaItems(event.items);
	if (items) params.items = items;
	return params;
}

export function projectGa4(event: PaperCommerceEvent): Ga4Event | null {
	switch (event.name) {
		case "product_viewed":
			if (!event.currency) return null;
			return { name: "view_item", params: commerceParams(event) };
		case "product_added_to_cart":
			if (!event.currency) return null;
			return { name: "add_to_cart", params: commerceParams(event) };
		case "checkout_started":
			if (!event.currency) return null;
			return { name: "begin_checkout", params: commerceParams(event) };
		case "checkout_step_viewed":
			if (event.step === "shipping") return { name: "add_shipping_info", params: commerceParams(event) };
			if (event.step === "payment") return { name: "add_payment_info", params: commerceParams(event) };
			return null;
		case "checkout_completed":
			if (!event.currency || !event.transactionId) return null;
			return {
				name: "purchase",
				params: {
					transaction_id: event.transactionId,
					...commerceParams(event),
				},
			};
		case "search_submitted":
			return { name: "search", params: {} };
	}
}
