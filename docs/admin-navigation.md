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

### Browser access and language (13 October 2026)

Local Compose defaults Dashboard to Simplified Chinese (`DASHBOARD_LOCALE_CODE=ZH_HANS`).
The top bar language selector updates the existing browser preference. Locale packs
reload on every switch, including switching back to Chinese; runtime `LOCALE_CODE`
from the served HTML takes precedence over the build fallback.

Commerce Ops retains separate operator authorization. Browser page requests now
open `/ops/login` with a Chinese login form instead of stopping at a Basic Auth
challenge. Use the existing `OPS_OPERATORS_JSON` account, or legacy username
`analytics` with `ANALYTICS_DASHBOARD_SECRET`. Successful login returns to the chosen
page and sets an eight-hour HttpOnly, SameSite=Strict signed cookie (Secure on HTTPS).
Credentials and roles stay server-side. Changing passwords or operator scopes revokes
existing cookies. API callers can continue using Basic Auth. No Host-based auth
bypass is enabled.

The session cookie uses Path=/ because the existing Chatwoot gateway lives at
`/api/ops/chatwoot`; that endpoint still checks the current operator and its
mutation origin guard. Operators can clear the cookie with the header logout button.
Login redirects and mutation checks resolve the public origin from deployment
configuration and a verified Host, because standalone Next.js can expose its Docker
hostname in `request.url`. Unconfigured Host values remain rejected.
The Chinese pack includes 441 corrected common labels; upstream advanced dialogs
and third-party extension content may still fall back to English.

Validation: Dashboard source typecheck (including 4,221 strict files), language
switching and navigation tests; Storefront docs, dependency policy, typechecks and
lint; 1,225 unit tests plus 12 brand safety tests. In container checks, unset
deployment-only public market variables and mount the real backend Schema, so the
test fixtures can select their own locale/channel configuration.

The deployed HTTP checks passed login redirect, incorrect password handling,
cross-origin rejection, session cookie, logout, all 12 registered Ops page routes,
the Dashboard Chinese bootstrap config and live Saleor GraphQL. The Chatwoot
gateway correctly reports its missing external configuration after authentication.
Browser click/visual acceptance could not run because browser access to the local
Dashboard was denied; no visual pass is claimed. External Chatwoot and AI services
remain configuration-dependent and have not been actually integrated here.

Continue in a new window: open this repository and ask “继续处理本地后台功能，先阅读
docs/admin-navigation.md，保留现有部署和认证配置”。

## Visual themes and storefront isolation

- Saleor already supports light/dark switching in the account menu.
- Desktop navigation expands to 296px or collapses to a 72px icon rail. The collapse choice is stored only in this browser; mobile and tablet continue to use Saleor's full navigation drawer.
- Clicking a group icon while collapsed reopens the sidebar and expands that group. The global search still targets Saleor `/search` and retains its native `/` shortcut.
- Navigation emphasis is scoped to
  `dashboard/src/components/Sidebar/menu/CommerceSidebar.module.css`.
- An accessible color selector in the existing user menu allows Blue (`#2563eb`), Slate (`#475569`) or Teal (`#0f766e`). The browser-local choice overrides `--commerce-admin-preference-accent`; neutral colors continue to follow Macaw light/dark mode.
- Change the fallback `--commerce-admin-nav-accent` to adjust the default color in source. The setting is deliberately **not** a global merchant preference and is not stored in Saleor, so multiple operators may prefer different accents.
- Do **not** import Dashboard CSS or admin tokens into `storefront/`. Paper
  and Puck-generated brand pages have their own appearance and published data.
  Changing admin sidebar colors does not publish or alter any brand theme.

## Extension path

To add a real custom function: first implement and secure its actual ops route,
then add its route, name, section and navigation permissions to
`dashboard/src/components/Sidebar/menu/commerceOpsNavigation.ts`. The existing
`useMenuStructure.tsx` builds the link from this registry without editing the
Saleor module for each additional custom page. Custom Saleor Apps should continue
to use upstream extension mount points instead of direct core changes.

Future work, not included here: a single-session, same-shell Commerce Ops
integration; fine-grained data scopes for analytics per brand; full browser E2E
coverage with both services running.

## Review checklist

- Verify all existing Saleor native routes, including Home with pinned widgets,
  remain reachable after menu regrouping.
- Test expanded/collapsed, keyboard focus, active route, hover and small viewports
  in light and dark themes.
- Verify sensitive ops pages remain inaccessible to users without ops
  authorization even if the user types the URL directly.
- Test secure HTTPS deployment and local http://localhost setup separately.
- Run `pnpm --dir dashboard exec jest src/components/Sidebar/menu/commerceOpsLinks.test.ts src/components/Sidebar/menu/commerceOpsNavigation.test.ts --runInBand`
  and `pnpm --dir dashboard exec tsc --noEmit` on a checkout with dependencies.

## Navigation regression notes

- Native order/product/customer lists and search remain reachable.
- Settings is an accordion with links to real native Saleor configuration pages.
- Orders, Analytics, and Online store start expanded, but operators can close them.
- Search appears as a clickable field only when the account has native Search permission.
- Only two UI preferences use browser localStorage: `commerce-admin-sidebar-collapsed` and `commerce-admin-navigation-accent`. No merchant data or storefront colors are stored.

## Visual prototype comparison (11 October 2026)

Design language: Macaw UI-based **modern minimal SaaS commerce administration**,
with merchant-oriented information architecture inspired by Shoplazza.
Do not mistake the generated reference graphic for a screenshot of the running app.

| Reference feature | Implemented in PR #53 | Follow-up / caveat |
| --- | --- | --- |
| Left navigation and admin brand | 296px desktop sidebar, blue SLOER monogram, Admin tag | The prototype's geometric logo is illustrative, not a final company vector logo |
| Clearly separated first/second levels | Native Macaw accordion plus inset neutral child group, blue active state and keyboard focus | Needs browser visual regression in light/dark and mobile |
| Global search and account at top | Reuse Saleor `/search`, `/` shortcut, and the staff account page in shared Macaw topbar | Do not invent a notifications service or duplicate Saleor page tools |
| Navigation collapse | Persistent 72px desktop icon rail; click a group icon to re-open that section | Mobile uses native full drawer |
| Admin color choices | Browser-local blue/slate/teal accent and native Macaw light/dark modes | It changes admin navigation only, not any published storefront theme |
| Apps & custom pages | Existing Commerce Ops links registered in a standalone file; Saleor extension mount points preserved | Ops remain separate authenticated pages that open in a new tab |
| Theme overview image, Fleur card & multi-page grid | **Not a live Dashboard implementation.** Real `/ops/themes` is Puck editor for homepage and default product detail template | Any future theme landing page must read real templates and publish status; do not insert static fake cards |
| Store data / payment / checkout content | Unchanged Saleor pages and existing Ops service | Existing logic and permission checks stay authoritative |

Current acceptance boundary: do not claim 1:1 image fidelity or completion of
the unified Commerce Ops shell until tested in a running browser with Saleor and
the separately authenticated Ops service. In particular, the mock Fleur management
landing page is not currently an implemented management route.
