import { resolveSitemapContext, sitemapPairKey } from "@/lib/seo/sitemap-context";
import { readSitemapManifest } from "@/lib/seo/sitemap-manifest";
import { sitemapFailure, sitemapResponse, sitemapXml } from "@/lib/seo/sitemap-xml";

export const maxDuration = 120;
export async function GET(request: Request) {
	try {
		const { baseUrl, pairs } = await resolveSitemapContext(request.headers.get("host"));
		const locations: string[] = [];
		for (const pair of pairs) {
			const key = sitemapPairKey(pair);
			locations.push(`${baseUrl}/sitemaps/${key}-pages-0.xml`);
			const entities = ["products", "categories", "collections"] as const;
			const manifests = await Promise.all(entities.map((entity) => readSitemapManifest(pair.channel, pair.locale, entity)));
			manifests.forEach((chunks, i) => chunks.forEach((_, chunk) => locations.push(`${baseUrl}/sitemaps/${key}-${entities[i]}-${chunk}.xml`)));
		}
		return sitemapResponse(sitemapXml(locations, true));
	} catch (error) {
		return sitemapFailure(error);
	}
}
