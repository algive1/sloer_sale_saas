"use client";

import { useTransition } from "react";
import { bumpChromeVersion } from "@/lib/chrome-sync";
import { ariaDisabledClassName } from "@/ui/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommerceItem } from "@/lib/analytics/catalog";
import { emitCommerceEvent } from "@/lib/analytics/emit.client";
import { createCommerceEventId } from "@/lib/analytics/event-id";

type Props = {
	deleteLine: () => Promise<void>;
	analytics?: { channel: string; value: number; currency: string; item: CommerceItem };
};

export const DeleteLineButton = ({ deleteLine, analytics }: Props) => {
	const [isPending, startTransition] = useTransition();

	return (
		<button
			type="button"
			className={cn(
				"text-sm text-muted-foreground hover:text-foreground",
				ariaDisabledClassName,
				"aria-disabled:opacity-60",
			)}
			onClick={() => {
				if (isPending) return;
				startTransition(async () => {
					await deleteLine();
					if (analytics) {
						emitCommerceEvent({
							name: "cart_item_removed",
							eventId: createCommerceEventId("cart_remove"),
							channel: analytics.channel,
							value: analytics.value,
							currency: analytics.currency,
							items: [analytics.item],
						});
					}
					// This tab re-renders via `refresh()` inside the action;
					// other tabs sync their cart chrome on next focus.
					bumpChromeVersion();
				});
			}}
			aria-disabled={isPending}
		>
			{isPending ? "Removing" : "Remove"}
			<span className="sr-only">line from cart</span>
		</button>
	);
};
