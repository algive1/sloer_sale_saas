# AI-assisted Saleor catalog translation — reviewed drafts (phase 1)

This is a **system-wide, operator-only tooling plugin**. It does not install a
separate TMS and does not call translation models while a shopper is browsing.
It reuses Paper's existing Saleor catalog source snapshots and the existing
**create-only** Saleor translation importer.

The plugin currently has **no interactive ops editor, background scheduler,
approval permissions UI, or auto-publish**. Those belong in the next phase.
This slice intentionally requires an operator to review and explicitly approve.

## Supported content

Source: local, gitignored
\`storefront/config/saleor/fixtures/catalog-translations/locales/catalog-source.json\`
created from Saleor with \`pnpm catalog:translations:fetch\`.

Supported translated fields: product/category/collection \`name\`,
\`description\`, \`seoTitle\`, \`seoDescription\`. **Does not auto-translate** URL
slugs, brand policies, returns, duties, shipping/price claims, CMS/Puck layout,
email templates or text attribute values. English is the source language
and cannot be a translation target.

## Operator workflow

1. Obtain a Saleor configurator token for **staging**, following the catalog
   fixture documentation. Do not expose it in \`NEXT_PUBLIC_*\` settings.
2. Fetch baseline: \`pnpm --dir storefront catalog:translations:fetch\`.
3. Set a server/operator-only AI endpoint and credentials, for example:

   \`\`\`dotenv
   TRANSLATION_AI_BASE_URL=https://your-approved-provider.example/v1
   TRANSLATION_AI_API_KEY=replace-with-secret
   TRANSLATION_AI_MODEL=your-json-capable-model
   STOREFRONT_SITE_ID=fashion
   # For a multi-brand deployment, also set STOREFRONT_SITES_JSON to the
   # same authoritative site/channel mapping used by the storefront.
   \`\`\`

4. Check planned work (zero AI calls): from \`storefront/\`,
   \`pnpm translations:ai:plan -- --locale de --site fashion --max-items 10\`.
5. Generate **drafts**, an explicit operation that sends selected merchant
   catalog copy to the configured model:
   \`pnpm translations:ai:generate -- --locale de --site fashion --max-items 10\`.
   Optional \`--glossary /absolute/path/to/glossary.json\` pins terminology.
6. Inspect gitignored \`locales/ai-draft.de.fashion.json\`. Change each acceptable
   entry's \`status\` from \`draft\` to \`approved\` **after checking the full text**;
   edit \`translation\` fields when needed. Others remain \`draft\`.
7. Export only approved items:
   \`pnpm translations:ai:export -- --locale de --site fashion --max-items 10\`.
   Exports \`locales/de.ai-approved.fashion.yaml\` in the format understood by
   the existing importer. It never calls Saleor or deploys translations.
8. Use \`pnpm --dir storefront catalog:translations:plan\` to compare the approved
   file with the **live** Saleor instance, then
   \`pnpm --dir storefront catalog:translations:deploy\` only when reviewed.
   The importer is create-only by default and protects existing manual edits.

In a multi-brand deployment, Saleor stores a product's translated fields on
the **shared catalog entity**, not per Saleor Channel or brand. Before exporting
with multiple brands configured, verify whether the product is published across
brand Channels and pass \`--acknowledge-global-saleor-translations\` explicitly.
For brand-specific copy on a shared product, do NOT run the importer; split the
products or design brand-scoped content. Mapping a Channel to one brand is
necessary but **not** sufficient to isolate shared product translations.

## Safety and performance

- Default command is plan-only. \`--generate\` must be explicit. API credentials
  stay in operator environment variables; no checkout, product, or request code
  imports the model client.
- Network calls are serial, with a default batch cap of 10 entities and
  configurable \`--max-items 1..100\`. Includes a 30s request timeout and
  retries for HTTP 429/5xx. A failed run persists the successful partial draft.
- Only HTTPS is allowed by default. Development may opt into loopback HTTP with
  \`TRANSLATION_AI_ALLOW_LOCAL_HTTP=1\`, never remote plaintext.
- Each entity's \`sourceHash\` is calculated from its English source, kind and
  primary slug. Export is denied for stale approved source content. Manual
  approvals are never overwritten silently. Changes to a glossary require
  review rather than blindly reusing an old translation.
- The output must be valid strict JSON with exact source field names; blank
  content, unexpected HTML, missing placeholders and extra keys are rejected.
- All output files live in a **gitignored** directory and are written with
  \`0600\` file permissions on supported platforms. Do not commit production
  text or AI credentials. The provider receives source merchant copy, so its
  retention, residency and terms must be approved before using the service.
- Legal claims, care instructions, textile/material assertions and performance
  claims require human verification even when a draft passes technical checks.
  A model's output cannot be considered approved or safe by default.

## Development checks

\`\`\`bash
pnpm --dir storefront translations:ai:test
pnpm --dir storefront locales:check
pnpm --dir storefront test:run
\`\`\`

## Next phase

Backend persisted translation jobs with worker scheduling, a brand-aware ops UI
and per-user review audit trail. This must reuse Saleor translations and preserve
the default create-only write policy. No AI model should ever run in the
shopper-facing runtime path.
