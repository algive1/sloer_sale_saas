# Storefront localization coverage and launch gate

## What this audit measures

The code-owned Paper storefront UI uses \`storefront/messages/{locale}.json\` and next-intl. Run from \`storefront/\`:

\`\`\`bash
node scripts/audit-locale-coverage.mjs --all
NEXT_PUBLIC_STOREFRONT_LOCALES=en,de,fr node scripts/audit-locale-coverage.mjs --fail-incomplete
node --test scripts/audit-locale-coverage.node-test.mjs
\`\`\`

\`--all\` is informational. \`--fail-incomplete\` blocks only locales selected via \`NEXT_PUBLIC_STOREFRONT_LOCALES\` (defaults to \`en\`) and checks structural key coverage. \`--json\` emits details for build pipelines. Equal-to-English values are **advisory**, not hard failures.

At the October 2026 baseline English has 513 leaf message keys. German, French, Polish, Finnish, and Norwegian have the full English key set. Japanese misses 3, Korean misses 10. Spanish, Italian, Dutch, Portuguese, Danish, Swedish, and Czech each miss 419 and currently rely heavily on fallback English strings. This is NOT a translation-quality review and can change as code evolves.

## What this audit does NOT measure

- Product, category, collection, attribute and SKU variant translations stored in Saleor.
- Puck visual theme translations, CMS and merchant-owned policy pages.
- Transactional email, Chatwoot/customer support, shipping and checkout payment-provider content.
- Native idioms, grammar, currency-market fit, taxes, shipping availability or legal accuracy.

A zero-missing UI result does **not** authorize enabling a new market. Review the full shopping chain separately.

## Recommended staged publication

1. Enable only markets and languages whose actual translated catalog, policy and checkout copy have been reviewed.
2. In CI/deployment, run \`--fail-incomplete\` using the exact locale allowlist intended for the Next.js build. In Docker this is a **build-time** public variable, not just an after-build runtime override.
3. Review unchanged-English candidates manually; translation completeness is different from translated copy quality.
4. Add AI-assisted generation on top of existing Saleor translation mutations, not a new on-page runtime translation system. Store drafts and review status independently; never let a shopper request call a text-generation provider.
5. In multi-brand mode enforce verified brand/Channel ownership and be aware that Saleor product translations are on the underlying product entity, not inherently scoped to a brand. Shared product entities require explicit cross-brand policy before automated mutation.
