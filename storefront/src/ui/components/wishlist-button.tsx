"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";
import { createCommerceEventId } from "@/lib/analytics/event-id";
import {
	readWishlist,
	setWishlistItem,
	subscribeWishlist,
	syncWishlistFromServer,
	wishlistSnapshot,
} from "@/lib/wishlist/client";
import type { WishlistRecord } from "@/lib/wishlist/types";
import { cn } from "@/lib/utils";

export function WishlistButton({
	item,
	className,
}: {
	item: WishlistRecord;
	className?: string;
}) {
	const snapshot = useSyncExternalStore(subscribeWishlist, wishlistSnapshot, () => "[]");
	const saved = useMemo(
		() => (JSON.parse(snapshot) as WishlistRecord[]).some((entry) => entry.productId === item.productId),
		[snapshot, item.productId],
	);

	useEffect(() => {
		void syncWishlistFromServer();
	}, []);

	const toggle = () => {
		const next = !saved;
		setWishlistItem(item, next);
		emitCommerceEvent({
			name: next ? "wishlist_added" : "wishlist_removed",
			eventId: createCommerceEventId(next ? "wishlist_add" : "wishlist_remove"),
			channel: item.channel,
			value: item.price,
			currency: item.currency,
			items: [{
				itemId: item.productId,
				variantId: item.variantId,
				itemName: item.name,
				price: item.price,
				quantity: 1,
			}],
		});
	};

	return (
		<button
			type="button"
			aria-pressed={saved}
			aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				toggle();
			}}
			className={cn(
				"inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm backdrop-blur transition hover:bg-secondary",
				className,
			)}
		>
			<Heart className={cn("h-5 w-5", saved && "fill-current")} />
		</button>
	);
}
