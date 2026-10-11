import { expect, type APIRequestContext } from "@playwright/test";

/** Follow this host's one-level index; never fetch an advertised foreign origin. */
export async function publicSitemapLocations(request: APIRequestContext, origin: string, host?: string) {
	const headers: Record<string, string> = host ? { Host: host } : {};
	const root = await request.get(origin + "/sitemap.xml", { headers });
	expect(root.status()).toBe(200);
	expect(root.headers()["content-type"]).toContain("xml");
	const xml = await root.text();
	expect(xml).toContain("<sitemapindex ");
	const links = Array.from(xml.matchAll(/<loc>([^<]*)<\/loc>/g), (match) => match[1]);
	expect(links.length).toBeGreaterThan(0);
	expect(new Set(links).size).toBe(links.length);
	const locations: string[] = [];
	for (const link of links) {
		const url = new URL(link);
		if (host) expect(url.host).toBe(host);
		expect(url.pathname).toMatch(/^\/sitemaps\/[A-Za-z0-9_-]+\.xml$/);
		const child = await request.get(origin + url.pathname, { headers });
		expect(child.status(), link).toBe(200);
		expect(child.headers()["content-type"]).toContain("xml");
		const body = await child.text();
		expect(body).toContain("<urlset ");
		const urls = Array.from(body.matchAll(/<loc>([^<]*)<\/loc>/g), (match) => match[1]);
		expect(urls.length).toBeLessThanOrEqual(1000);
		locations.push(...urls);
	}
	expect(new Set(locations).size).toBe(locations.length);
	return { locations, links, xml };
}
