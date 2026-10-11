# Merchant-oriented Dashboard sidebar (Saleor + Commerce Ops)

## Intent

Keep Saleor Dashboard as the management shell and keep Saleor's existing GraphQL
routes, permission filters, extension mount points, favorites and saved widgets.
Rearrange top-level navigation around common merchant work:

Home → Orders → Products → Customers → Marketing → Analytics → Online store
→ Sales channels → Apps → Settings.

Search remains a convenient global shortcut. Group headers toggle their subtree;
second-level rows navigate. This avoids a clickable nested link inside an
accordion trigger, and makes the two hit targets unambiguous.

## What has actually changed

- The native pages are **not reimplemented**. Orders, drafts, products, categories,
  collections, gift cards, customers, promotions, vouchers, CMS models, menus,
  translations, installed extensions, channel configuration and settings continue
  to resolve to the original Saleor Dashboard routes.
- Commerce Ops links only appear after a safe, publicly reachable
  `COMMERCE_OPS_URL` is configured at **Dashboard build time**. They open in
  a new tab with `noopener noreferrer`; this is intentional until a trusted
  unified auth/session model and app shell have been implemented.
- The `/ops` service has **separate authorization**. A visible link must never
  be interpreted as a grant of data, brand or role access. Saleor sidebar permissions
  are merely a navigation filter and cannot replace Commerce Ops route authorization.
- No unimplemented Google/Meta/TikTok management screen is invented. Saleor
  channels are provided under Sales channels; existing official Apps remain
  under Apps.
- AI images are inside the existing theme editor, not a standalone admin app.
  Customer-support settings, system plugins and brand sites keep their existing
  read-only or configuration-dependent limitations.

The plugin registry of Paper remains distinct from Saleor's official Apps.

## Local and production configuration

Local Compose:
```dotenv
COMMERCE_OPS_URL=http://localhost:3000
```

Production:
```dotenv
COMMERCE_OPS_URL=https://www.example.com
```

Only absolute HTTPS origins are accepted; plain HTTP is permitted only for
localhost / 127.0.0.1 / [::1] local development. Credentials, paths, query strings,
and fragments in the configured base are rejected.

After changing this variable, **rebuild** the Dashboard container because Vite
embeds the public (non-secret) origin in its JS bundle.

## Visual themes and storefront isolation

- Saleor already supports light/dark switching in the account menu.
- Navigation emphasis is scoped to
  `dashboard/src/components/Sidebar/menu/CommerceSidebar.module.css`.
- Override `--commerce-admin-nav-accent` (currently `#2563eb`) to adjust
  the admin sidebar accent. Neutral backgrounds are generated from the current
  theme text color so they remain suitable for light and dark UI.
- Do **not** import Dashboard CSS or admin tokens into `storefront/`. Paper
  and Puck-generated brand pages have their own appearance and published data.
  Changing admin sidebar colors does not publish or alter any brand theme.

## Extension path

To add a real custom function: first implement and secure its actual ops route,
then register its link in `useMenuStructure.tsx` through `opsItem` with the
appropriate Saleor navigation permission. Custom Saleor Apps should continue
to use upstream extension mount points instead of direct core changes.

Future work, not included here: a single-session, same-shell Commerce Ops
integration; fine-grained data scopes for analytics per brand; runtime admin
accent preset switcher; full browser E2E coverage with both services running.

## Review checklist

- Verify all existing Saleor native routes, including Home with pinned widgets,
  remain reachable after menu regrouping.
- Test expanded/collapsed, keyboard focus, active route, hover and small viewports
  in light and dark themes.
- Verify sensitive ops pages remain inaccessible to users without ops
  authorization even if the user types the URL directly.
- Test secure HTTPS deployment and local http://localhost setup separately.
- Run `pnpm --dir dashboard exec jest src/components/Sidebar/menu/commerceOpsLinks.test.ts --runInBand`
  and `pnpm --dir dashboard exec tsc --noEmit` on a checkout with dependencies.
