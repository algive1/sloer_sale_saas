import { assertSitemapSize } from "./sitemap-size";
import { unstable_rethrow } from "next/navigation";
export function escapeSitemapXml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
export function sitemapXml(locations: readonly string[], index: boolean): string {
	assertSitemapSize(locations.map((url) => ({ url })));
	const root = index ? "sitemapindex" : "urlset";
	const entry = index ? "sitemap" : "url";
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
		locations.map((url) => `<${entry}><loc>${escapeSitemapXml(url)}</loc></${entry}>`).join("\n") + `\n</${root}>`;
	if (new TextEncoder().encode(xml).length > 50_000_000) throw new Error("sitemap_xml_too_large");
	return xml;
}
export function sitemapResponse(xml: string): Response {
	return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate", Vary: "Host" } });
}
export function sitemapFailure(error: unknown): Response {
	// Runtime/prerender control flow belongs to Next, never to an HTTP 503 shell.
	unstable_rethrow(error);
	const unknown = error instanceof Error && error.message === "unknown_sitemap_host";
	return new Response(unknown ? "Not Found" : "Sitemap temporarily unavailable", {
		status: unknown ? 404 : 503,
		headers: { "Cache-Control": "no-store", ...(unknown ? {} : { "Retry-After": "60" }) },
	});
}
