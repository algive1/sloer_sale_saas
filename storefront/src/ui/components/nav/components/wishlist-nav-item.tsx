"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { LinkWithChannel } from "@/ui/atoms/link-with-channel";
import {
	subscribeWishlist,
	syncWishlistFromServer,
	wishlistSnapshot,
} from "@/lib/wishlist/client";
import type { WishlistRecord } from "@/lib/wishlist/types";

export function WishlistNavItem() {
	const snapshot = useSyncExternalStore(subscribeWishlist, wishlistSnapshot, () => "[]");
	const count = useMemo(() => (JSON.parse(snapshot) as WishlistRecord[]).length, [snapshot]);

	useEffect(() => {
		void syncWishlistFromServer();
	}, []);

	return (
		<LinkWithChannel
			href="/wishlist"
			aria-label={count > 0 ? `Wishlist, ${count} saved products` : "Wishlist"}
			className="relative inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-secondary"
		>
			<Heart className="h-5 w-5" />
			{count > 0 ? (
				<span className="absolute right-0 top-0 min-w-4 rounded-full bg-foreground px-1 text-center text-[10px] leading-4 text-background">
					{count > 99 ? "99+" : count}
				</span>
			) : null}
		</LinkWithChannel>
	);
}
