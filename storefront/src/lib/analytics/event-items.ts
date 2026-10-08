import type { PaperCommerceEvent } from "@/lib/analytics/catalog";

export type AnalyticsEventItem = {
	itemId: string;
	variantId: string | null;
	sku: string | null;
	itemName: string | null;
	price: number | null;
	quantity: number;
};

export function analyticsEventItems(event: PaperCommerceEvent): AnalyticsEventItem[] {
	return (event.items ?? [])
		.map((item): AnalyticsEventItem | null => {
			const itemId = clipText(item.itemId, 300);
			if (!itemId) return null;
			const price = typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null;
			const quantity =
				typeof item.quantity === "number" && Number.isFinite(item.quantity)
					? Math.max(1, Math.trunc(item.quantity))
					: 1;
			return {
				itemId,
				variantId: clipText(item.variantId, 300),
				sku: clipText(item.sku ?? undefined, 200),
				itemName: clipText(item.itemName, 400),
				price,
				quantity,
			};
		})
		.filter((item): item is AnalyticsEventItem => item !== null);
}

function clipText(value: string | undefined, maxChars: number): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	let safe = "";
	for (let index = 0; index < trimmed.length && safe.length < maxChars; index++) {
		const code = trimmed.charCodeAt(index);
		if (code >= 32 && code !== 127) safe += trimmed[index];
	}
	return safe || null;
}
