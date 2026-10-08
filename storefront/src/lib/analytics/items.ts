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
		product?: {
			id?: string | null;
			name?: string | null;
			category?: { name?: string | null } | null;
			thumbnail?: { url?: string | null } | null;
		} | null;
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
			const productId = line.variant?.product?.id?.trim() || "";
			const itemId = productId || variantId || fallbackId;
			if (!itemId) return null;

			const productName = line.variant?.product?.name || line.productName || undefined;
			const variantName = line.variant?.name || line.variantName || undefined;
			const quantity = Math.max(1, line.quantity ?? 1);

			return {
				itemId,
				productId: productId || undefined,
				categoryName: line.variant?.product?.category?.name ?? undefined,
				imageUrl: line.variant?.product?.thumbnail?.url ?? undefined,
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
