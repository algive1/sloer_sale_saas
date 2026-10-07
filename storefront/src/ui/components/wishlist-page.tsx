"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import {
	subscribeWishlist,
	syncWishlistFromServer,
	wishlistSnapshot,
} from "@/lib/wishlist/client";
import type { WishlistRecord } from "@/lib/wishlist/types";
import { WishlistButton } from "@/ui/components/wishlist-button";
import { buttonClassName } from "@/ui/components/ui/button";

export function WishlistPage() {
	const snapshot = useSyncExternalStore(subscribeWishlist, wishlistSnapshot, () => "[]");
	const items = useMemo(() => JSON.parse(snapshot) as WishlistRecord[], [snapshot]);

	useEffect(() => {
		void syncWishlistFromServer();
	}, []);

	if (items.length === 0) {
		return (
			<div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
				<div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
					<Heart className="h-6 w-6 text-muted-foreground" />
				</div>
				<h1 className="text-h1">Your wishlist</h1>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">
					Save products here while you compare options. Your wishlist stays on this device and syncs to
					your account when cloud analytics storage is configured.
				</p>
				<Link href="../products" className={buttonClassName({ asLink: true, className: "mt-8" })}>
					Browse products
				</Link>
			</div>
		);
	}

	return (
		<section className="container-content py-10">
			<div className="mb-8 flex items-end justify-between gap-4">
				<div>
					<h1 className="text-h1">Your wishlist</h1>
					<p className="mt-2 text-sm text-muted-foreground">{items.length} saved products</p>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-6">
				{items.map((item) => (
					<article key={item.productId} className="min-w-0">
						<div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-card bg-secondary">
							<Link href={item.href} className="block h-full w-full">
								{item.image ? (
									<Image src={item.image} alt={item.name} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
								) : null}
							</Link>
							<WishlistButton item={item} className="absolute right-3 top-3" />
						</div>
						<Link href={item.href} className="block truncate font-medium hover:underline">
							{item.name}
						</Link>
						<p className="mt-1 text-sm text-muted-foreground">
							{new Intl.NumberFormat(undefined, { style: "currency", currency: item.currency }).format(item.price)}
						</p>
					</article>
				))}
			</div>
		</section>
	);
}
