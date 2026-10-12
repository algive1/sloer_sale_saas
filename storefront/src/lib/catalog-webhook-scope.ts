/** Resolve only configured storefront markets from a signed catalog event. */
export function catalogWebhookChannels(payload: unknown, configured: readonly string[]): string[] {
	const targets = new Set<string>();
	const add = (value: unknown) => {
		if (typeof value === "string" && value.trim()) targets.add(value.trim());
		else if (
			value &&
			typeof value === "object" &&
			"slug" in value &&
			typeof value.slug === "string" &&
			value.slug.trim()
		)
			targets.add(value.slug.trim());
	};
	if (payload && typeof payload === "object") {
		const data = payload as Record<string, unknown>;
		add(data.channel);
		const variant = data.productVariant ?? data.variant;
		const variantProduct =
			variant && typeof variant === "object" && "product" in variant ? variant.product : null;
		for (const node of [data.product, variantProduct, data.category, data.collection, data.channel]) {
			if (!node || typeof node !== "object") continue;
			const entity = node as Record<string, unknown>;
			add(entity.channel);
			for (const key of ["channelListings", "channel_listings", "channels"]) {
				const entries = entity[key];
				if (!Array.isArray(entries)) continue;
				for (const entry of entries) {
					if (entry && typeof entry === "object" && "channel" in entry) add(entry.channel);
					else add(entry);
				}
			}
		}
	}
	// Native/global events often omit channel context (including deleted entities).
	// In this self-operated Core that affects all configured markets, never an arbitrary default.
	return [...new Set(configured)].filter((channel) => targets.size === 0 || targets.has(channel));
}

/** URL membership/slug changes need a fresh sitemap; stock/media/price-only churn does not. */
export function changesSitemapCatalog(event: string | null, entity: string): boolean {
	if (!event) return ["product", "category", "collection", "channel"].includes(entity);
	return (
		/^(product|category|collection)_(created|updated|deleted)$/.test(event.trim().toLowerCase()) ||
		/^channel_(created|updated|deleted|status_changed)$/.test(event.trim().toLowerCase())
	);
}
