# SEO and Google Merchant launch checklist

The storefront exposes two production discovery surfaces:

- `/sitemap.xml` — generated from public Saleor catalog data and advertised in `/robots.txt`.
- `/merchant/google.xml?channel=us&locale=en` — Google Merchant XML feed, disabled by default.

## Before enabling the Merchant feed

Do not enable the feed against a development catalog. Confirm all of the following first:

1. `NEXT_PUBLIC_STOREFRONT_URL` is the real HTTPS production domain.
2. The Saleor channel is active and uses the launch currency/country.
3. Products are intentionally published in that channel.
4. Every sellable variant has a stable SKU.
5. Use GTIN when the manufacturer provides one. Otherwise provide brand + MPN when applicable.
   The product `brand` attribute (plain text or a single-choice display name) is
   shared by PDP JSON-LD and the Merchant feed. Missing brands are omitted, not
   inferred from a category or reseller/store name. Populate this attribute before
   advertising branded products; an omitted field can require Merchant diagnostics.
6. Product-level `Brand`, `Google Product Category`, `Gender`, and `Age Group` attributes are populated when relevant.
7. Variant-level `Color`, `Size`, `GTIN`, and `MPN` attributes are populated when relevant.
8. Product images are publicly reachable by Google.
9. Shipping prices and delivery windows match what checkout actually offers.
10. Tax configuration reflects the launch market.
11. Refund, returns, shipping, privacy, terms, and contact pages are published and reachable from the storefront.
12. Remove demo products or exclude their SKU prefixes.

The US baseline intentionally contains `DEMO-` SKUs. A safe production setting is:

```env
GOOGLE_MERCHANT_FEED_ENABLED=true
GOOGLE_MERCHANT_EXCLUDE_SKU_PREFIXES=DEMO-
```

## Feed behavior

The feed is variant-level. Each Saleor variant becomes one Google Merchant `<item>`.

Mapped fields include:

- `id` — SKU, with a channel/variant fallback when SKU is absent.
- `item_group_id` — Saleor product ID.
- `title`, `description`, `link`, `image_link`.
- `availability`, `price`, `condition`.
- `brand`, `gtin`, `mpn`.
- `google_product_category`.
- `color`, `size`, `gender`, `age_group`.
- `identifier_exists=false` when neither GTIN nor MPN is present.

The product link deep-links the exact Saleor variant via the `variant` query parameter.

Products and variants are paginated. The export does not silently truncate products with more than 100 variants.

## Multi-market feeds

Use a separate scheduled feed URL per Saleor market when currency, language, or catalog differs:

```text
https://store.example.com/merchant/google.xml?channel=us&locale=en
https://store.example.com/merchant/google.xml?channel=eu&locale=de
```

The requested channel must be in `STOREFRONT_CHANNELS`, and the locale must be enabled for that channel by the locale/channel matrix when one is configured.

## Google Merchant Center

After production data is ready:

1. Verify/claim the production domain in Merchant Center.
2. Create a scheduled data source using the feed URL for the target channel/locale.
3. Configure shipping/returns in Merchant Center so they match the storefront.
4. Resolve feed diagnostics before enabling paid campaigns.
5. Confirm landing-page price, currency, availability, variant, and shipping match the submitted item.
6. Only then link Merchant Center to Google Ads.

The feed endpoint returns `X-Robots-Tag: noindex, nofollow`; it is a data source, not a search-result page.

## Brand-aware product structured data

The PDP reads `assignedAttribute(slug: "brand")` directly, independently of the
50-attribute display limit. The JSON-LD builder receives the route Channel and
resolves its configured brand without request-header reads or additional network
calls. Product manufacturer and merchant/seller identity remain separate.
Multi-brand Offer/AggregateOffer URLs use the brand's first registered domain,
matching canonical metadata and the feed; unknown brand Channels produce no
product JSON-LD rather than falling back to a global seller. Legacy single-brand
deployments continue to use `NEXT_PUBLIC_STOREFRONT_URL` and the configured seller.

Dependency-free regression gate (Node 24):

```sh
node --test storefront/scripts/audit-brand-safety.node-test.mjs
```

This gate checks production helper behavior; it does not replace GraphQL codegen,
TypeScript, Vitest, a production build or storefront browser acceptance.

## Sitemap behavior

`/sitemap.xml` includes, for every configured locale/channel pair:

- storefront home
- all-products page
- published product detail pages
- non-empty category pages
- channel-visible collection pages

Translated slugs are used when Saleor has a translation for the active locale.
