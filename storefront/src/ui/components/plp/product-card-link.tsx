"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";
import { createCommerceEventId } from "@/lib/analytics/event-id";

type ProductCardAnalytics = {
	channel: string;
	listName: string;
	position?: number;
	item: {
		itemId: string;
		itemName: string;
		price: number;
		currency: string;
	};
};

type ProductCardLinkProps = Omit<ComponentProps<typeof Link>, "prefetch"> & {
	children: ReactNode;
	analytics?: ProductCardAnalytics;
};

export function ProductCardLink({ href, className, children, analytics, onClick, ...props }: ProductCardLinkProps) {
	const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
		if (analytics) {
			emitCommerceEvent({
				name: "product_selected",
				eventId: createCommerceEventId("product_select"),
				channel: analytics.channel,
				listName: analytics.listName,
				position: analytics.position,
				value: analytics.item.price,
				currency: analytics.item.currency,
				items: [{
					itemId: analytics.item.itemId,
					itemName: analytics.item.itemName,
					price: analytics.item.price,
					quantity: 1,
				}],
			});
		}
		onClick?.(event);
	};

	return (
		<Link href={href} className={className} onClick={handleClick} {...props}>
			<ProductCardLinkPending>{children}</ProductCardLinkPending>
		</Link>
	);
}

function ProductCardLinkPending({ children }: { children: ReactNode }) {
	const { pending } = useLinkStatus();
	return (
		<span
			className={cn("block transition-opacity duration-150", pending && "pointer-events-none opacity-60")}
			aria-busy={pending}
		>
			{children}
		</span>
	);
}
