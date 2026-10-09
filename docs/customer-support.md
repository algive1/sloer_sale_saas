# System customer-support plugin: Chatwoot CE (phase 1)

This is the **first integration slice**, not a completed multi-channel customer-service or Saleor order-access system.

## Architecture

- One separately deployed Chatwoot Community Edition instance for the platform.
- **Exactly one Chatwoot Account per brand**. Each Account has its own Website Inbox (and may later add email/social Inboxes).
- The existing trusted Host → brand → Saleor Channel mapping selects the Chatwoot binding. A browser-provided siteId, channel, Account ID or email is **never** an authorization input.
- A single platform-wide, code-registered `customer-support` plugin; a brand-specific *configuration* is not a plugin install toggle.
- No Saleor Core changes and no Chatwoot source fork. Phase 1 only loads Chatwoot's official website SDK when a visitor clicks the support launcher. It intentionally does **not** fetch contacts/orders or call `setUser`.

## Setup (self-hosted)

1. Deploy a pinned **Chatwoot Community Edition** image and its Postgres/Redis/worker dependencies, using the official deployment instructions. Verify DNS, HTTPS, backups and an externally reachable Website Inbox. Do not deploy enterprise-licensed components without authorization.
2. Create one Chatwoot Account for **each** configured storefront brand, and a Website Inbox per Account. Copy each **public Website Token**. Configure languages, brand welcome text, online/offline replies, privacy notices and assigned staff in Chatwoot.
3. In the storefront runtime environment (not a `NEXT_PUBLIC_` variable), set both:
   - `SUPPORT_CHATWOOT_BASE_URL=https://support.example.com`
   - `SUPPORT_CHATWOOT_SITES_JSON=[{"siteId":"fashion","accountId":1,"websiteToken":"public_fashion_token"},{"siteId":"jewelry","accountId":2,"websiteToken":"public_jewelry_token"}]`
   These are illustrative IDs/tokens only. In single-brand deployment, use `STOREFRONT_SITE_ID` or `primary`.
4. Ensure Chatwoot Website Inbox has the correct allowed storefront domain(s) and CSP `script-src`, `frame-src` and `connect-src` policies allow the chosen self-hosted Chatwoot origin. Configure `wss:` as appropriate.
5. Open `/ops/support` using the existing operations authentication. This reports **configuration validity**, not a live Chatwoot health check.
6. On each brand domain, click the help launcher to load `/packs/js/sdk.js`. Send a test message and answer it from the corresponding Chatwoot Account; repeat for every brand.

When no config is set, there is **no widget button and no Chatwoot network request** on storefront browsing. Configuration errors fail closed without breaking catalog/checkout.

## Boundaries and limitations

- Public Website Tokens are permitted in browser SDK configuration. **Never put Chatwoot API access tokens, HMAC signing keys or Saleor admin tokens in this JSON or browser props.**
- In phase 1 all conversations are guest-only. Do **not** identify Saleor customers by email or attach orders based on an unverified Chatwoot contact. Authenticated identity mapping will require brand-specific, server-signed HMAC and logout/session reset.
- Chatwoot Accounts isolate conversation/contact ownership at the application layer. Strict brand operator RBAC and upstream Saleor global customer/checkout boundaries are not solved by this integration.
- The operations link opens the stock Chatwoot workbench. Embedded order panels, agent SSO, cross-brand staff roles, Webhook handling, business automation and shipping/refund operations are intentionally not part of this phase.
- Do not publish support access on checkout until its mobile overlays and payment return flows pass full browser E2E.
- Production is blocked until a real self-hosted Chatwoot instance, its CE license dependencies, HTTPS/CSP, two branded domains and guest-chat flow have passed end-to-end tests.
- If external scripts are subject to consent under the operating privacy/legal policy, gate launch of the chat session accordingly; never silently reuse marketing consent.

## Verification

```sh
pnpm --dir storefront generate:all
pnpm --dir storefront exec tsc --noEmit
pnpm --dir storefront exec vitest run src/plugins/customer-support/config.test.ts src/plugins/system/registry.test.ts
pnpm --dir storefront build
```

Additional browser acceptance:
1. No Chatwoot request before click; SDK loads once after click.
2. Correct Chatwoot Account on two different brand domains, including the same visitor email.
3. Wrong/unknown Host+Channel shows no cross-brand widget.
4. Unconfigured/invalid Chatwoot has no impact on browsing or checkout.
5. Mobile chat button does not cover add-to-cart, sticky navigation or checkout.
6. Log out clears any later authenticated integration session before identity features launch.

Related design: `docs/multibrand-architecture.md`, `docs/system-plugins.md`.
