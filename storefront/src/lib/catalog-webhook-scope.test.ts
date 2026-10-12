import { expect, it } from "vitest";
import { catalogWebhookChannels, changesSitemapCatalog } from "./catalog-webhook-scope";
const markets = ["us", "jewelry-us"];
it("refreshes configured markets for global, empty and deleted-entity events", () => {
	for (const payload of [
		{ product: { slug: "shared" } },
		{ category: { slug: "all" } },
		{ product: { channelListings: [] } },
	]) {
		expect(catalogWebhookChannels(payload, markets)).toEqual(markets);
	}
});
it("keeps explicit scopes and native/legacy variant memberships within configured markets", () => {
	expect(catalogWebhookChannels({ product: { channel: { slug: "jewelry-us" } } }, markets)).toEqual([
		"jewelry-us",
	]);
	expect(
		catalogWebhookChannels(
			{
				productVariant: {
					product: {
						channelListings: [{ channel: { slug: "jewelry-us" } }, { channel: { slug: "foreign" } }],
					},
				},
			},
			markets,
		),
	).toEqual(["jewelry-us"]);
	expect(
		catalogWebhookChannels(
			{ variant: { product: { channel_listings: [{ channel: { slug: "us" } }] } } },
			markets,
		),
	).toEqual(["us"]);
	expect(catalogWebhookChannels({ product: { channel: { slug: "foreign" } } }, markets)).toEqual([]);
});
it("deduplicates markets and recognizes channel lifecycle events", () => {
	expect(catalogWebhookChannels({ channel: { slug: "jewelry-us" } }, [...markets, "us"])).toEqual([
		"jewelry-us",
	]);
	expect(changesSitemapCatalog("CHANNEL_STATUS_CHANGED", "channel")).toBe(true);
});
it("invalidates URL catalogs without making price, stock, metadata and media churn recrawl them", () => {
	for (const event of [
		"product_created",
		"product_updated",
		"product_deleted",
		"category_updated",
		"collection_deleted",
	])
		expect(changesSitemapCatalog(event, "product")).toBe(true);
	for (const event of [
		"product_variant_updated",
		"product_media_updated",
		"product_metadata_updated",
		"product_variant_stock_updated",
		"order_created",
	])
		expect(changesSitemapCatalog(event, "product")).toBe(false);
	expect(changesSitemapCatalog(null, "product")).toBe(true);
});
