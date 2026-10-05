# Product model baseline

The catalog must be compatible with B2C merchandising, Google Merchant Center and future multi-market expansion.

## Product

Required business fields:

- title
- description
- brand
- product type
- category
- Google product category
- media
- SEO title
- SEO description

## Variant

Each sellable variant must have:

- unique SKU
- option values, e.g. color / size
- channel price
- inventory assignment
- GTIN when one exists
- MPN when one exists

Recommended attributes from day one:

- brand
- gtin
- mpn
- color
- size
- material
- gender
- age_group
- google_product_category

## Example

```
Men's Classic Sneaker
  Black / 40 -> SN-BLK-40
  Black / 41 -> SN-BLK-41
  White / 40 -> SN-WHT-40
```

Do not use one SKU for multiple physical variants.

## Phase 1 channel

- channel: us
- language: en
- currency: USD
- target country: US

The model must remain compatible with later channels such as `uk`, `eu`, and `jp`.
