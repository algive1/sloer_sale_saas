# Automatic storefront language negotiation — phase 1

This implementation **reuses** Paper's locale/channel routes, next-intl JSON, Saleor translated product fields, checkout locale cookies and localized SEO. It does not translate products or convert currencies at runtime.

## Entry-point rules

Only the bare "/" is personalized on first visit. Its routing order is:

1. Verify the request Host against the brand mapping and its exclusive Saleor Channels. Unknown brands fail closed.
2. Select the brand's default market unless a reverse-proxy-verified country matches an explicitly configured market belonging to that same brand.
3. On the resulting Channel, choose a valid saved browse language, then weighted browser \`Accept-Language\`, then the brand's default language, then the first enabled language.
4. Enforce both \`NEXT_PUBLIC_STOREFRONT_LOCALES\` and the optional language×channel matrix. Never cross into another brand just to serve a language.
5. Respond with a **temporary 307**, \`Cache-Control: private, no-store\` and a locale cookie so shared CDN caches cannot retain a visitor-specific redirect.

A URL that already specifies a language (including product pages entered from SEO/ads) is **not** auto-negotiated, preventing forced redirects away from indexed content. Explicit \`/{locale}\` links can choose a permitted market of the same brand when the default market does not support that language. Legacy Channel URLs remain compatible.

## Optional country-based market matching

Example — two independent brands:

\`\`\`dotenv
NEXT_PUBLIC_STOREFRONT_LOCALES=en,de,fr
NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS=en:fashion-us,en:fashion-eu,de:fashion-eu,fr:fashion-eu,en:jewelry-us
STOREFRONT_COUNTRY_CHANNELS=DE:fashion-eu,FR:fashion-eu,US:fashion-us,DE:jewelry-eu
STOREFRONT_GEO_COUNTRY_HEADER=x-storefront-visitor-country
\`\`\`

Geo matching is **off by default**. Only enable it behind a trusted TLS reverse proxy that strips any client-supplied copy and overwrites the configured header based on a trusted GeoIP source. The Next app must not be directly exposed to untrusted requests carrying that header. Codes must be ISO 3166-1 alpha-2; invalid/unmatched codes safely revert to the brand default market. Country routing changes a Saleor Channel, not the display currency via arithmetic.

## Rollout requirements

- Publish and verify the actual UI translations and Saleor catalog, CMS, attributes, policies and Puck content for each enabled language. A translated UI file is **not** equivalent to a complete translated storefront.
- Configure the deployment language allowlist (the top-level \`.env.example\` intentionally still enables only English by default).
- Test mobile browser languages, saved preferences, explicit ad URLs and SEO canonical/hreflang, brand Host routing and two distinct brands' cart/checkout flows.
- Verify the configured CDN response honors \`Cache-Control: private, no-store\` for personalized redirects, while canonical product pages retain CDN caching.
- Treat cross-brand authorization boundaries and translated legal/return policy review as production launch gates.

## Next development slice: AI-assisted translation

Build an asynchronous system-level translation workflow over existing Saleor translation mutations. Use source hashes, brand-scoped glossaries, create-only writes by default, preview/review before publish, and bounded queue workers. Never invoke AI translation during a shopper page request. Existing human edits take priority.
