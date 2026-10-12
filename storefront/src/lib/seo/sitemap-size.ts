/** Conservative bound for this route's URL/changefreq/priority-only XML entries. */
export function assertSitemapSize(entries: readonly { url: string }[]): void {
	if (entries.length > 50_000) throw new Error("sitemap_requires_partitioning");
	let bytes = 1024;
	const encoder = new TextEncoder();
	const sizes = new Map<string, number>();
	for (const entry of entries) {
		let size = sizes.get(entry.url);
		if (size === undefined) {
			const escaped = entry.url
				.replaceAll("&", "&amp;")
				.replaceAll("<", "&lt;")
				.replaceAll(">", "&gt;")
				.replaceAll('"', "&quot;")
				.replaceAll("'", "&apos;");
			size = encoder.encode(escaped).length + 256;
			sizes.set(entry.url, size);
		}
		bytes += size;
		if (bytes > 50_000_000) throw new Error("sitemap_requires_partitioning");
	}
}
