# Operations accounts: safe interim access scopes

This phase improves merchant-owned back-office access. It does **not** provide
independent merchant tenant isolation, Saleor Dashboard RBAC, SSO, or audit trails.

## Modes

- **Legacy mode** (unchanged): without `OPS_OPERATORS_JSON`, every `/ops`
  page and API uses `ANALYTICS_DASHBOARD_SECRET` with Basic username
  `analytics`. This is a single platform administrator, not scoped RBAC.
- **Operator mode** (opt-in): a nonempty `OPS_OPERATORS_JSON` **replaces**
  the shared password. Legacy username/password stops working. Malformed
  configuration fails closed (503); invalid login gets 401; insufficient scope
  gets 403. Always use HTTPS behind a reverse proxy.
- `platform_admin`: all merchant-owned `/ops` pages/actions; it can operate
  all brands. This does not grant user privileges in an external Saleor
  Dashboard or Chatwoot installation.
- `brand_analyst`: **GET/HEAD only** for their filtered `/ops/sites` landing,
  exact authorized `/ops/sites/<siteId>`, `/ops/sites/<siteId>/insights` and
  `/ops/sites/<siteId>/readiness` routes. The landing renders only permitted
  brand names and links and never shows a theme publishing shortcut. It cannot
  read global analytics, access plugin/theme/translation/support consoles or call any
  `/ops` API, even if a brand ID is included in query/body/headers.
  It cannot change products, publish, email customers or initiate payments.

## Deployment example

Choose distinct randomly generated, printable ASCII passwords of at least 32
characters. Store JSON as a **single secret environment value**, not in
committed examples, frontend `NEXT_PUBLIC_*` values, or GitHub issues.

```json
[
  {"username":"owner_ops","password":"REPLACE_WITH_A_LONG_RANDOM_SECRET_1","role":"platform_admin"},
  {"username":"fashion_reader","password":"REPLACE_WITH_A_LONG_RANDOM_SECRET_2","role":"brand_analyst","siteIds":["fashion"]}
]
```

The `fashion` ID above must exist in trusted `STOREFRONT_SITES_JSON`.
Unknown, empty, repeated IDs, duplicate usernames, invalid roles or weak
passwords invalidate the entire operators configuration. An analyst's entry point is `https://ops.example.com/ops/sites` (the
operator must use an HTTPS host routed to this storefront service). The
site listing is dynamically generated from authenticated server-side credentials
and excludes unauthorized brands, not merely CSS-hidden. Navigation links to
global pages intentionally return 403 for readers.

Root Docker Compose passes `OPS_OPERATORS_JSON` to the storefront container;
configure it on the server and recreate that container. Retain
`ANALYTICS_DASHBOARD_SECRET` if you need it for cron/legacy integrations, but
it is **not** a fallback interactive login while operator mode is active.
If your reverse proxy or CDN caches any `/ops` response, disable that caching
regardless of the application's `private, no-store` response headers.
HTTP Basic browsers may cache credentials: use separate private windows or
browser logout/credential-clearing procedures when changing operators.
Limit repeated login attempts at the reverse proxy and restrict staff IP
ranges or use access-policy gateways where feasible.

## Security boundaries and remaining work

- Keep `STOREFRONT_SITES_JSON` disabled for production multi-brand rollout
  until customer identity, saved addresses, payment returns, order credentials
  and external Saleor GraphQL authorization are production certified.
- The frontend brand scoping is not Saleor Core multi-tenant isolation.
  Only trusted platform operators can perform `/ops` writes.
- This phase does not track operator identity on each mutation. Before adding
  brand-specific write roles: implement durable operator sessions, server-side
  action permissions, body-level brand checks, reviewer/audit logs and
  expanded role-aware navigation with independent security E2E.
- The separate Saleor Dashboard and Chatwoot staff consoles require their
  own credentials, permissions and account/brand isolation.
- Disable and rotate compromised operators by updating the server-side JSON,
  then restarting/redeploying the storefront. Do not log or expose passwords.
- The `/ops` route middleware must be executed at the trusted ingress. Never
  rewrite the protected pages to `/api/`, which this app's matcher excludes.

## Acceptance

- Old single-brand Basic account still authenticates when no JSON configured.
- Operator mode refuses the legacy shared credentials and rejects malformed JSON.
- Brand analyst can load a filtered `/ops/sites` page showing only their
  assigned brands, not a sibling brand, global analytics or `/ops` APIs; POST
  remains forbidden even on an allowed brand URL.
- Platform admin can still view and perform the existing operations actions.
- Any `/ops` path containing a dot still crosses middleware and authentication.
- CI runs `src/lib/ops/authorization.test.ts` plus build, security and
  browser integration checks.

No configuration secrets or merchant passwords are checked into git.
