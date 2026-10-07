import type { PaperCommerceEvent } from "@/lib/analytics/catalog";

/** Vercel Pro allows two custom properties. Values must stay low-cardinality. */
export type VercelCustomEvent = {
	name: string;
	props: Record<string, string | number | boolean>;
};

export function projectVercel(event: PaperCommerceEvent): VercelCustomEvent | null {
	switch (event.name) {
		case "product_list_viewed":
			if (!event.channel) return null;
			return { name: "view_item_list", props: { channel: event.channel, count: event.items?.length ?? 0 } };
		case "product_selected":
			if (!event.channel) return null;
			return { name: "select_item", props: { channel: event.channel, position: event.position ?? 0 } };
		case "product_viewed":
			if (!event.channel) return null;
			return { name: "view_item", props: { channel: event.channel, value: event.value } };
		case "wishlist_added":
			if (!event.channel) return null;
			return { name: "wishlist_add", props: { channel: event.channel, value: event.value } };
		case "wishlist_removed":
			if (!event.channel) return null;
			return { name: "wishlist_remove", props: { channel: event.channel, value: event.value } };
		case "product_added_to_cart":
			if (!event.channel) return null;
			return { name: "add_to_cart", props: { channel: event.channel, value: event.value } };
		case "cart_viewed":
			if (!event.channel) return null;
			return { name: "view_cart", props: { channel: event.channel, value: event.value } };
		case "cart_item_removed":
			if (!event.channel) return null;
			return { name: "remove_from_cart", props: { channel: event.channel, value: event.value } };
		case "cart_quantity_changed":
			return {
				name: "cart_quantity",
				props: { from: event.previousQuantity, to: event.newQuantity },
			};
		case "checkout_started":
			if (!event.channel) return null;
			return { name: "begin_checkout", props: { channel: event.channel, value: event.value } };
		case "checkout_step_viewed":
			if (!event.channel) return null;
			return { name: "checkout_step", props: { step: event.step, channel: event.channel } };
		case "shipping_method_selected":
			if (!event.channel) return null;
			return { name: "shipping_method", props: { channel: event.channel, method: event.method } };
		case "payment_method_selected":
			if (!event.channel) return null;
			return { name: "payment_method", props: { channel: event.channel, method: event.wallet || event.method } };
		case "payment_failed":
			if (!event.channel) return null;
			return { name: "payment_failed", props: { channel: event.channel, provider: event.provider ?? "unknown" } };
		case "checkout_failed":
			if (!event.channel) return null;
			return { name: "checkout_failed", props: { channel: event.channel, stage: event.stage } };
		case "checkout_completed":
			if (!event.currency) return null;
			return { name: "purchase", props: { currency: event.currency, value: event.value } };
		case "refund_completed":
			if (!event.currency) return null;
			return { name: "refund", props: { currency: event.currency, value: event.value } };
		case "search_submitted":
			if (!event.channel) return null;
			return { name: "search", props: { zero: event.zero, channel: event.channel } };
	}
}
