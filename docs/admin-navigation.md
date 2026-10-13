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
- Commerce Ops links only appear after a safe `COMMERCE_OPS_URL` is configured
  at **Dashboard build time**. They open `/commerce-ops` inside the Dashboard
  shell; the page embeds only a known `/ops` route and does not open a new tab.
- In Compose, Dashboard's `:9000` Nginx proxies `/ops`, `/commerce-admin`,
  `/api/admin-sso`, `/api/ops`, and `/_next` to Storefront over the private
  Compose network. Vite development uses the same paths as a same-origin proxy.
- The embedded Ops view reuses the current Saleor Dashboard session. Dashboard
  sends its access token only to the same-origin iframe using `postMessage`;
  Storefront verifies `me`, staff status, Saleor permission codes and accessible
  channels against Saleor GraphQL before issuing a five-minute HttpOnly cookie.
  The signed cookie contains no access token and is refreshed while the Dashboard
  session remains active. Dashboard logout clears it.
- The Ops request boundary remains authoritative. Saleor permissions are checked
  on each `/ops` request; channel-restricted staff are limited to configured sites
  matching their accessible Saleor channels and cannot perform mutations. The
  Dashboard route gate and Ops navigation are presentation filters only.
- Existing Ops modules are also exposed as a self-hosted official Saleor App at
  `/api/manifest`. Its seven `APP_PAGE` entries route straight to the existing
  analytics, ads, reminders, support, theme, translation, and SEO/Merchant
  feature pages. App Bridge passes the current Dashboard staff token through a
  same-origin message; Storefront verifies staff, permissions, and channel scope
  before issuing its short-lived Ops session. The App's
  `/commerce-admin/configuration` view opens system-plugin status and feature
  links. Add `SALEOR_OPS_APP_PUBLIC_URL` for the browser-visible Dashboard origin
  (local Compose example: `http://localhost:9000/`). Install the API-reachable
  Manifest URL from Saleor Apps; local Compose uses `http://dashboard/api/manifest`
  because Saleor Core fetches it server-to-server. The App is installed and active
  in the local Saleor instance; the seven extensions and configuration route were
  opened through a real Saleor staff session on `:9000`. Production deployment and
  permission-revocation/logout checks remain outstanding.
- Custom system-plugin items in the Dashboard sidebar open their feature pages
  directly (ads delivery and Merchant Feed included). Plugin status and
  deployment configuration remain in the official App's Apps configuration view.
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

### Browser access, language and translations (13 October 2026)

Dashboard chooses the first browser language supported by Saleor when the user
has not selected a language manually. Existing manual selections remain in place;
the language selector switches to manual mode. In automatic mode, a browser
`languagechange` event updates the Dashboard locale. Simplified and Traditional
Chinese language tags map to `zh-Hans` and `zh-Hant` respectively.

Commerce Ops now supports English and Simplified Chinese independently of the shopper locale allowlist. Dashboard passes its selected locale; standalone Ops reads browser Accept-Language. An HttpOnly locale cookie preserves explicit choices through links and forms. Server pages, client controls, charts, known service diagnostics and Puck editor chrome use the existing next-intl library. Merchant content and unknown provider errors retain their original text. Same-origin system App sidebar labels reuse the operations registry; other Apps own their labels.

The inner Ops sidebar and toolbar remain hidden in embedded views. Saleor staff session, permission and channel boundaries remain authoritative. Language selection does not grant access. See [ops-language-release.md](ops-language-release.md) for the two-language, 22-route browser checks, real staff SSO, image IDs and the failed production gates.

The integrated route inventory contains 22 pages:

- `/ops/analytics` and its checkout, destinations, products, realtime, reminders,
  and traffic subpages;
- `/ops/plugins`, `/ops/merchant`, `/ops/sites`, and `/ops/sites/[siteId]` with catalog,
  fulfillment, insights, readiness, realtime, and tracking subpages;
- `/ops/support`, `/ops/support/settings`, `/ops/themes`, and `/ops/translations`.

**Chinese translation coverage is not yet complete for Saleor's native Dashboard.**
The checked-in `zh-Hans` pack has 2,333 message IDs while the default pack has
4,667, leaving 2,334 default messages without Chinese text; missing messages show
their English default. Existing Commerce Ops pages are authored in Chinese, but
the upstream Dashboard and extension copy can still display English. Do not claim
full Chinese coverage until every message and extension surface is translated and
audited. External plugin content is controlled by each plugin.

Validation status for this integration is recorded with the task's final report;
do not treat route allowlist tests as proof that a live page and its backing data
service work. Chatwoot, AI providers, analytics storage and other optional services
remain dependent on their deployment configuration.

Continue in a new window: open this repository, read [ops-language-release.md](ops-language-release.md), preserve all uncommitted changes and follow its continuation prompt.

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

Follow-up: complete and audit the native Dashboard Chinese locale and external
extension copy; add browser E2E checks against Dashboard :9000 and the Storefront
upstream; validate every permission mapping against a configured Saleor instance.

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

| Reference feature                                  | Implemented in PR #53                                                                                                                                            | Follow-up / caveat                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Left navigation and admin brand                    | 296px desktop sidebar, blue SLOER monogram, Admin tag                                                                                                            | The prototype's geometric logo is illustrative, not a final company vector logo                            |
| Clearly separated first/second levels              | Native Macaw accordion plus inset neutral child group, blue active state and keyboard focus                                                                      | Needs browser visual regression in light/dark and mobile                                                   |
| Global search and account at top                   | Reuse Saleor `/search`, `/` shortcut, and the staff account page in shared Macaw topbar                                                                          | Do not invent a notifications service or duplicate Saleor page tools                                       |
| Navigation collapse                                | Persistent 72px desktop icon rail; click a group icon to re-open that section                                                                                    | Mobile uses native full drawer                                                                             |
| Admin color choices                                | Browser-local blue/slate/teal accent and native Macaw light/dark modes                                                                                           | It changes admin navigation only, not any published storefront theme                                       |
| Apps & custom pages                                | Existing Commerce Ops links registered in a standalone file; Ops routes render inside the Dashboard shell through a same-origin iframe and Saleor-backed session | Verify permissions and each configured service against a live Saleor deployment                            |
| Theme overview image, Fleur card & multi-page grid | **Not a live Dashboard implementation.** Real `/ops/themes` is Puck editor for homepage and default product detail template                                      | Any future theme landing page must read real templates and publish status; do not insert static fake cards |
| Store data / payment / checkout content            | Unchanged Saleor pages and existing Ops service                                                                                                                  | Existing logic and permission checks stay authoritative                                                    |

Current acceptance boundary: local Saleor SSO and route opening are verified, but
do not claim complete Chinese coverage. The checked-in `zh-Hans` resource still
has 2,334 fewer message IDs than the Dashboard default resource, and full native translation coverage remains outstanding. Ops itself now has English and Chinese copy; production release is still blocked by the findings in [ops-language-release.md](ops-language-release.md). The mock Fleur management landing page
is not an implemented management route.
