import type { CommerceItem } from "@/lib/analytics/catalog";

type CommerceLineLike = {
	id?: string | null;
	quantity?: number | null;
	unitPrice?: { gross?: { amount?: number | null } | null } | null;
	productName?: string | null;
	variantName?: string | null;
	variant?: {
		id?: string | null;
		name?: string | null;
		sku?: string | null;
		product?: { name?: string | null } | null;
	} | null;
};

export function commerceItemsFromLines(
	lines: readonly CommerceLineLike[] | null | undefined,
): CommerceItem[] {
	if (!lines?.length) return [];

	return lines
		.map((line): CommerceItem | null => {
			const variantId = line.variant?.id?.trim() || "";
			const fallbackId = line.id?.trim() || "";
			const itemId = variantId || fallbackId;
			if (!itemId) return null;

			const productName = line.variant?.product?.name || line.productName || undefined;
			const variantName = line.variant?.name || line.variantName || undefined;
			const quantity = Math.max(1, line.quantity ?? 1);

			return {
				itemId,
				variantId: variantId || undefined,
				sku: line.variant?.sku ?? undefined,
				itemName: productName
					? variantName && variantName !== productName
						? `${productName} — ${variantName}`
						: productName
					: variantName,
				price: line.unitPrice?.gross?.amount ?? undefined,
				quantity,
			};
		})
		.filter((item): item is CommerceItem => item !== null);
}
