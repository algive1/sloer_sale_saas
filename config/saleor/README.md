# Saleor commerce configuration

The first market is defined declaratively in `us-baseline.yml`.

## Why this is in Git

Channels, warehouse relationships, shipping methods, product types, attributes, SKU pricing and demo inventory are configuration—not undocumented Dashboard clicks. Keeping the baseline in Git makes development and staging reproducible.

## Configurator version

Use `@saleor/configurator@3.23.2`, which targets Saleor 3.23.x.

Validate without connecting to a Saleor instance:

```bash
pnpm config:validate
```

## Safety

`us-baseline.yml` is a **development/staging baseline**.

Before production:

- replace the placeholder warehouse/contact details
- remove the demo product
- configure real US tax collection/nexus strategy
- configure production shipping rates and carriers
- replace demo MPNs with real manufacturer identifiers
- provide real GTINs only when they actually exist; never fabricate GTINs
- review product data before enabling Google Merchant Center feeds

The first production launch remains US / English / USD, but production configuration will be managed separately from this bootstrap fixture.
