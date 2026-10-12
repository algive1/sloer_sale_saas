import { resolveSitemapContext, sitemapPairKey } from "@/lib/seo/sitemap-context";
import { readSitemapChunk, readSitemapManifest } from "@/lib/seo/sitemap-manifest";
import type { SitemapEntity } from "@/lib/seo/sitemap-page";
import { sitemapFailure, sitemapResponse, sitemapXml } from "@/lib/seo/sitemap-xml";
import { buildStorefrontPath } from "@/lib/storefront-path";

export const maxDuration = 120;
const missing = () => new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await context.params;
		const match = /^([A-Za-z0-9_-]{1,512})-(pages|products|categories|collections)-(0|[1-9]\d{0,3})\.xml$/.exec(id);
		if (!match) return missing();
		const { baseUrl, pairs } = await resolveSitemapContext(request.headers.get("host"));
		const pair = pairs.find((pair) => sitemapPairKey(pair) === match[1]);
		if (!pair) return missing();
		const entity = match[2];
		const index = Number(match[3]);
		const prefix = (suffix = "") => `${baseUrl}${buildStorefrontPath(pair.locale, pair.channel, suffix)}`;
		if (entity === "pages") return index === 0 ? sitemapResponse(sitemapXml([prefix(), prefix("/products")], false)) : missing();
		const chunks = await readSitemapManifest(pair.channel, pair.locale, entity as SitemapEntity);
		if (!chunks[index]) return missing();
		const slugs = await readSitemapChunk(pair.channel, pair.locale, entity as SitemapEntity, chunks[index]);
		return sitemapResponse(sitemapXml(slugs.map((slug) => prefix(`/${entity}/${encodeURIComponent(slug)}`)), false));
	} catch (error) {
		return sitemapFailure(error);
	}
}
