# System customer-support plugin: Chatwoot CE (phase 1)

This is the **first integration slice**, not a completed multi-channel customer-service or Saleor order-access system.

## Architecture

- One separately deployed Chatwoot Community Edition instance for the platform.
- **Exactly one Chatwoot Account per brand**. Each Account has its own Website Inbox (and may later add email/social Inboxes).
- The existing trusted Host → brand → Saleor Channel mapping selects the Chatwoot binding. A browser-provided siteId, channel, Account ID or email is **never** an authorization input.
- A single platform-wide, code-registered `customer-support` plugin; a brand-specific *configuration* is not a plugin install toggle.
- No Saleor Core changes and no Chatwoot source fork. Phase 1 loads Chatwoot's official website SDK only after a visitor clicks its support launcher, and optionally offers a separately bound public WhatsApp click-to-chat link. It intentionally does **not** fetch contacts/orders or call `setUser`.

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


## Brand WhatsApp and chat recovery

Set `SUPPORT_WHATSAPP_SITES_JSON` at runtime with selected configured brands and distinct public international business numbers (8–15 digits, no plus sign/spaces):

```env
SUPPORT_WHATSAPP_SITES_JSON=[{"siteId":"fashion","phone":"12025550101"},{"siteId":"jewelry","phone":"12025550102"}]
```

The numbers above are illustrative fixtures, not real support accounts. Omitted brands have no link; foreign brands, duplicate numbers, invalid formatting and extra fields (including provider tokens) reject the configuration. The optional WhatsApp entry is independent of Chatwoot configuration; `/ops/support` shows each brand's number or missing/invalid configuration. Both entries obey the customer-support runtime pause.

Only a fixed greeting is prefilled (en/de/fr/es/ja/ko, English fallback). The link carries no automatic email, address, order ID/token, cart, page URL or authenticated identity. It uses `noopener noreferrer` and a no-referrer policy; the storefront makes no WhatsApp request before a visitor follows the link. Sending a message and receiving replies remain the visitor's and brand operator's actions. This is a public entry, not a WhatsApp Business API integration or synchronized inbox.

Chatwoot loading times out after 15 seconds if the SDK/ready event never arrives, displays a retry action and keeps the independent WhatsApp link available. SDK errors restore the launcher; retry reuses a valid loaded SDK instead of fetching duplicate scripts. Pending timers/listeners are cleaned up on unmount, and supported SDK locale updates follow the storefront language. Real service replies, mobile widget dimensions and offline behavior still require production acceptance.

Verification: configuration/Host/Channel/pause tests, actual client-component timeout/retry with a simulated SDK, and native production browser checks for both brand links, operator visibility, no pre-click requests and a 375px viewport. Final results are recorded in the PR. No real WhatsApp message or Chatwoot conversation is sent by these tests.

Official references: [WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934), [Chatwoot SDK settings/events](https://www.chatwoot.com/hc/user-guide/articles/1677587234-how-to-send-additional-user-information-to-chatwoot-using-sdk), [Chatwoot widget locales](https://app.chatwoot.com/hc/user-guide/articles/1677695546-languages-supported-in-chatwoot). Verified Saleor order context, staff workflow and message synchronization remain separate unfinished work.
