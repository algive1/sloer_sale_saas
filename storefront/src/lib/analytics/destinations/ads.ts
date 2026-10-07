import type { CommerceItem, PaperCommerceEvent } from "@/lib/analytics/catalog";

export type AdProjection = {
	name: string;
	params: Record<string, unknown>;
};

function itemId(item: CommerceItem): string {
	return item.variantId || item.itemId;
}

function valueCurrency(event: PaperCommerceEvent): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	if ("value" in event && typeof event.value === "number") params.value = event.value;
	if ("currency" in event && typeof event.currency === "string" && event.currency) {
		params.currency = event.currency;
	}
	return params;
}

function metaCommerceParams(event: PaperCommerceEvent): Record<string, unknown> {
	const params = valueCurrency(event);
	const items = event.items ?? [];
	if (items.length > 0) {
		params.content_type = "product";
		params.content_ids = items.map(itemId);
		params.contents = items.map((item) => ({
			id: itemId(item),
			quantity: item.quantity,
			...(typeof item.price === "number" ? { item_price: item.price } : {}),
		}));
	}
	return params;
}

function tiktokCommerceParams(event: PaperCommerceEvent): Record<string, unknown> {
	const params = valueCurrency(event);
	const items = event.items ?? [];
	if (items.length > 0) {
		params.content_type = "product";
		params.contents = items.map((item) => ({
			content_id: itemId(item),
			...(item.itemName ? { content_name: item.itemName } : {}),
			quantity: item.quantity,
			...(typeof item.price === "number" ? { price: item.price } : {}),
		}));
	}
	return params;
}

export function projectMeta(event: PaperCommerceEvent): AdProjection | null {
	switch (event.name) {
		case "product_viewed":
			return { name: "ViewContent", params: metaCommerceParams(event) };
		case "wishlist_added":
			return { name: "AddToWishlist", params: metaCommerceParams(event) };
		case "wishlist_removed":
		case "product_list_viewed":
		case "product_selected":
		case "cart_viewed":
		case "cart_item_removed":
		case "cart_quantity_changed":
		case "shipping_method_selected":
		case "payment_method_selected":
		case "payment_failed":
		case "checkout_failed":
		case "refund_completed":
			return null;
		case "product_added_to_cart":
			return { name: "AddToCart", params: metaCommerceParams(event) };
		case "checkout_started":
			return { name: "InitiateCheckout", params: metaCommerceParams(event) };
		case "checkout_step_viewed":
			return event.step === "payment"
				? { name: "AddPaymentInfo", params: metaCommerceParams(event) }
				: null;
		case "checkout_completed":
			return { name: "Purchase", params: metaCommerceParams(event) };
		case "search_submitted":
			return { name: "Search", params: {} };
	}
}

export function projectTikTok(event: PaperCommerceEvent): AdProjection | null {
	switch (event.name) {
		case "product_viewed":
			return { name: "ViewContent", params: tiktokCommerceParams(event) };
		case "wishlist_added":
			return { name: "AddToWishlist", params: tiktokCommerceParams(event) };
		case "wishlist_removed":
		case "product_list_viewed":
		case "product_selected":
		case "cart_viewed":
		case "cart_item_removed":
		case "cart_quantity_changed":
		case "shipping_method_selected":
		case "payment_method_selected":
		case "payment_failed":
		case "checkout_failed":
		case "refund_completed":
			return null;
		case "product_added_to_cart":
			return { name: "AddToCart", params: tiktokCommerceParams(event) };
		case "checkout_started":
			return { name: "InitiateCheckout", params: tiktokCommerceParams(event) };
		case "checkout_step_viewed":
			return event.step === "payment"
				? { name: "AddPaymentInfo", params: tiktokCommerceParams(event) }
				: null;
		case "checkout_completed":
			return { name: "CompletePayment", params: tiktokCommerceParams(event) };
		case "search_submitted":
			return { name: "Search", params: {} };
	}
}
