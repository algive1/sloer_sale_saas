import type { CommerceItem, PaperCommerceEvent } from "@/lib/analytics/catalog";

export type Ga4Event = { name: string; params: Record<string, unknown> };

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
		case "product_list_viewed":
			return { name: "view_item_list", params: { item_list_name: event.listName, ...commerceParams(event) } };
		case "product_selected":
			return {
				name: "select_item",
				params: { item_list_name: event.listName, ...commerceParams(event) },
			};
		case "product_viewed":
			if (!event.currency) return null;
			return { name: "view_item", params: commerceParams(event) };
		case "wishlist_added":
			return { name: "add_to_wishlist", params: commerceParams(event) };
		case "wishlist_removed":
			return { name: "remove_from_wishlist", params: commerceParams(event) };
		case "product_added_to_cart":
			if (!event.currency) return null;
			return { name: "add_to_cart", params: commerceParams(event) };
		case "cart_viewed":
			return { name: "view_cart", params: commerceParams(event) };
		case "cart_item_removed":
			return { name: "remove_from_cart", params: commerceParams(event) };
		case "cart_quantity_changed":
			return {
				name: "cart_quantity_changed",
				params: {
					...commerceParams(event),
					previous_quantity: event.previousQuantity,
					new_quantity: event.newQuantity,
				},
			};
		case "checkout_started":
			if (!event.currency) return null;
			return { name: "begin_checkout", params: commerceParams(event) };
		case "checkout_step_viewed":
			if (event.step === "shipping") return { name: "add_shipping_info", params: commerceParams(event) };
			if (event.step === "payment") return { name: "add_payment_info", params: commerceParams(event) };
			return null;
		case "shipping_method_selected":
			return {
				name: "add_shipping_info",
				params: { shipping_tier: event.method, ...commerceParams(event) },
			};
		case "payment_method_selected":
			return {
				name: "add_payment_info",
				params: {
					payment_type: event.wallet || event.method,
					...commerceParams(event),
				},
			};
		case "payment_failed":
			return {
				name: "payment_failed",
				params: {
					...(event.provider ? { payment_type: event.provider } : {}),
					...(event.code ? { error_code: event.code } : {}),
				},
			};
		case "checkout_failed":
			return { name: "checkout_failed", params: { checkout_stage: event.stage } };
		case "checkout_completed":
			if (!event.currency || !event.transactionId) return null;
			return {
				name: "purchase",
				params: { transaction_id: event.transactionId, ...commerceParams(event) },
			};
		case "refund_completed":
			if (!event.transactionId) return null;
			return {
				name: "refund",
				params: { transaction_id: event.transactionId, ...commerceParams(event) },
			};
		case "search_submitted":
			return { name: "search", params: {} };
	}
}
