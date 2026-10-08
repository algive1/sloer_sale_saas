# Puck fashion homepage — phase 1

The editor is mounted at **/ops/themes** on the same Next.js storefront.
It reuses the existing `/ops/*` middleware authentication
(`ANALYTICS_DASHBOARD_SECRET`, username `analytics`). HTTPS is required in production.

## Setup

1. Install the pinned `@puckeditor/core@0.23.0` dependency with
   `pnpm --dir storefront install --frozen-lockfile` (the lockfile is committed).
2. Set `THEME_LIBSQL_URL` and `THEME_LIBSQL_AUTH_TOKEN` to an isolated
   libSQL/Hrana database. The editor automatically creates the
   `storefront_theme_homepages` table. Do not reuse a public analytics token.
3. Set `STOREFRONT_SITE_ID` to a stable identifier for this storefront
   deployment, e.g. `fashion-us`. If different domains share a Next.js
   deployment, configure domain-to-site routing **before** enabling multi-site
   editing. This phase does not implement host-based routing.
4. Set `STOREFRONT_CHANNELS` and `NEXT_PUBLIC_STOREFRONT_LOCALES`.
   Each theme is keyed by `site_id + channel + locale`.
5. Start the storefront, open `/ops/themes` over HTTPS, choose a channel and
   locale, select the fashion template, reorder blocks, save draft, then publish.

## Scope

- Four blocks: editorial hero, Saleor collection, image/text and brand statement.
- Preconfigured fashion template plus blank canvas, desktop/mobile editor viewports.
- Draft saving and explicit publish, separately stored in libSQL.
- Published product collections rendered using existing Saleor GraphQL and
  `FeaturedCollectionSection`; prices and variants remain owned by Saleor.
- A missing or unpublished theme falls back to the existing Paper homepage.
- The editor's product-grid placeholders are **not** fake live products.
  Preview the published page to check real products and the final Paper styling.

## Security and isolation

- No write endpoint exists under publicly accessible `/api`.
  `/ops/themes/api` inherits Basic Auth and checks Origin for mutations.
- Blocks have a strict allowlist and bounded size, link, image and collection fields.
- Stored JSON is validated again before it is rendered.
- This is **not** a multi-tenant management console yet. A unified dashboard
  spanning independent domains still requires a site registry, host-to-site
  routing, per-site permissions and media ownership.
- No checkout/account/PDP routes are page-builder controlled.

## Validation required before merging

```bash
cd storefront
corepack pnpm install --frozen-lockfile
corepack pnpm run typecheck
corepack pnpm exec vitest run src/lib/theme-builder/validate.test.ts
corepack pnpm run lint
corepack pnpm run build
```

Also verify with a real Saleor channel, a non-empty collection, libSQL credentials,
a draft publish, a second browser reload, and mobile viewports. Do not merge the
prototype on static checks alone.
