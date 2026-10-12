import "server-only";

function dashboardUrl(path: string): URL | null {
	try {
		const url = new URL(process.env.SALEOR_DASHBOARD_URL ?? "");
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
			return null;
		url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path}`;
		return url;
	} catch {
		return null;
	}
}

export function nativeProductUrl(productId: string): string | null {
	return dashboardUrl(`products/${encodeURIComponent(productId)}`)?.toString() ?? null;
}

export function nativeBulkCatalogUrl(channelId: string): string | null {
	const url = dashboardUrl(`channels/${encodeURIComponent(channelId)}`);
	if (!url) return null;
	url.searchParams.set("action", "bulk-publish");
	return url.toString();
}

export function nativeChannelListUrl(): string | null {
	return dashboardUrl("channels/")?.toString() ?? null;
}
