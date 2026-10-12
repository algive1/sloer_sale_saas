import { expect, test } from "@playwright/test";
import { publicSitemapLocations } from "./helpers/sitemap";

const origin = process.env.PLAYWRIGHT_MULTIBRAND_BASE_URL ?? "http://127.0.0.1:3101";
const saleor = process.env.SALEOR_API_URL ?? "http://127.0.0.1:8000/graphql/";

test("public sitemaps cover the complete native product count for each brand's languages and reject an unknown Host", async ({
	request,
}) => {
	for (const brand of [
		{ host: "fashion.example.test", channel: "us", locales: ["en", "de"] },
		{ host: "jewelry.example.test", channel: "jewelry-us", locales: ["en", "fr"] },
	]) {
		const native = await request.post(saleor, {
			data: {
				query:
					"query SitemapExpectedCount($channel: String!) { products(first: 1, channel: $channel) { totalCount } }",
				variables: { channel: brand.channel },
			},
		});
		expect(native.status()).toBe(200);
		const body = (await native.json()) as {
			data?: { products?: { totalCount: number } };
			errors?: unknown[];
		};
		expect(body.errors ?? []).toEqual([]);
		const count = body.data?.products?.totalCount;
		expect(count).toBeGreaterThan(0);
		const { locations, links } = await publicSitemapLocations(request, origin, brand.host);
		expect(locations.every((url) => url.startsWith(`https://${brand.host}/`))).toBe(true);
		const otherHost = brand.channel === "us" ? "jewelry.example.test" : "fashion.example.test";
		expect((await request.get(origin + new URL(links[0]).pathname, { headers: { Host: otherHost } })).status()).toBe(404);
		for (const locale of brand.locales) {
			const prefix = `https://${brand.host}/${locale}/${brand.channel}/products/`;
			expect(
				locations.filter((url) => url.startsWith(prefix)).length,
				`${locale} must include every published native product`,
			).toBe(count);
		}
	}
	const unknown = await request.get(origin + "/sitemap.xml", {
		headers: { Host: "unregistered.example.test" },
	});
	expect(unknown.status()).toBe(404);
	expect(await unknown.text()).not.toContain("https://fashion.example.test/");
	expect((await request.get(origin + "/sitemaps/invalid.xml", { headers: { Host: "fashion.example.test" } })).status()).toBe(404);
});
