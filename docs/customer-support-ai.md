# Customer Support AI Agent Bot — initial implementation and deployment gates

This document covers an **optional AI integration** for the system-level `customer-support` plugin. The source now contains a signed Agent Bot callback, grounded FAQ selection, message de-duplication and human handoff; it is disabled by default and has not passed live Chatwoot/model integration tests.

## Reuse and licensing

- Keep Chatwoot Community Edition as the conversation/channel/assignment service.
- Chatwoot **Captain AI** is not part of the free self-hosted Community Edition. Do not access `enterprise/` code or bypass licensing.
- Chatwoot **Agent Bots** offer a documented integration path: an Inbox connects to a bot callback, the bot receives message/conversation events, and responds through Chatwoot's APIs. Verify exact API contracts against the pinned Chatwoot CE release before implementation.
- The bot integration should be another isolated service/worker owned by us, not a modification of Chatwoot or Saleor Core.
- Consider OpenAI-compatible API, locally hosted inference, and other model adapters only after evaluating cost, privacy, latency and answer quality.

Official references (check compatible release before coding):
- https://www.chatwoot.com/pricing/self-hosted-plans
- https://www.chatwoot.com/hc/user-guide/articles/1677497472-how-to-use-agent-bots
- https://www.chatwoot.com/features/chatbots

## Product rollout

### A. AI-assisted FAQ (first AI deliverable)
- Per-brand, per-language published source documents: shipping, shipping countries, returns, tracking instructions, sizing, warranty, contact hours.
- AI must return short, grounded answers with a link to the **same brand's** published policy/product page; if unavailable, ask a clarifying question or route to human support. Do not invent discounts, shipping promises or policies.
- Route to human on explicit request, low-confidence content retrieval, payment disputes, personal/financial questions, or abusive model inputs.
- Bot intro must transparently disclose automation; no claim that a human replied.
- Prefer off-switch on a per-brand **AI capability** (not per-brand system plugin installation).

### B. Catalog-aware product assistant
- Resolve `site_id` from authenticated Chatwoot Account → server-owned brand mapping.
- Resolve allowed Saleor Channels and storefront locale, then fetch the **current** published SKU/price/availability with least-privileged Saleor API access.
- A SKU unavailable in the brand Channel must not be recommended. Price/currency must come from that Channel, never from model memory.
- Product search results remain suggestions, not reservations or binding stock guarantees.

### C. Verified order-status assistant (later)
- Never treat a chat email, contact ID, order number, `account_id` in Webhook JSON or model tool arguments as proof of a customer's identity or order ownership.
- Require the customer to authenticate via the brand storefront or a verified, short-lived order access flow.
- Make the underlying server perform brand/channel AND verified customer/order authorization on **each query**. Return minimal status/carrier data, no full address or payment secrets.
- No money-moving actions (refunds, cancellations, payment collection, address changes) by the AI bot.

## Architecture and trust boundaries

```
Chatwoot Account A / Inbox A --- webhook ---> our Agent Bot callback
Chatwoot Account B / Inbox B --- webhook ---> our Agent Bot callback
                                             |
                                  verify webhook + resolve Account
                                             |
                                    fixed siteId + permission
                                             |
                              per-brand retrieval + model gateway
                                             |
                              bounded Chatwoot response + audit
```

1. Bind Chatwoot Account IDs and bot credentials to exactly one brand in server-side config. Use Chatwoot REST API to validate the referenced Conversation/Inbox against the authenticated Account; webhook body fields alone are untrusted.
2. Authenticate webhook signatures using raw bytes and pinned-version contract; reject replay by timestamp/idempotency key. Keep independent keys and bot credentials per brand.
3. Persist only minimal deduplication/trace metadata; strip card details, tokens, email/phone and checkout IDs from LLM prompts/logs unless strictly required by an independently authorized workflow.
4. Use a bounded asynchronous queue. Deduplicate by account + event ID + conversation/message ID. A failed provider must not block checkout or other brands.
5. Limit reply count and bot turn depth. Prevent bot replying to its own outgoing messages; human assignment cancels automated replies.
6. Treat storefront pages, messages and uploaded files as **untrusted input**, not system instructions. Apply retrieval filters and tools authorization outside the model.
7. Encrypt model/bot credentials at rest; use egress allowlists, rate limits, prompt budgets, configurable retention, sensitive-data redaction and cost alerts.
8. Retain an explicit opt-in/notice and lawful handling for international transfers; keep brand knowledge, memory, human access and consent isolated.
9. Instrument per-brand handoff, answer helpfulness, hallucination reports, P95 response time, total inference cost, failures and unauthorized-access attempts.

## Acceptance before production

- 2 unrelated brands, 3 Saleor Channels, 2 locales, same customer email; negative cross-brand retrieval tests.
- Prompt injection attempts from product descriptions/chat input cannot cause unauthorized tool calls or reveal hidden instructions/other brand records.
- FAQ answer backed by a current published policy; unpublished/missing policy yields human handoff rather than hallucination.
- No AI order details for anonymous chats; verified brand order can return only its authorized status.
- OpenAI/model outage and Chatwoot outage fall back to human queue; storefront checkout/purchase hot path remains unaffected.
- No actual AI model provider, webhook secret or bot token has been configured in phase 1. A green unit test does not equal a working end-to-end AI bot.

## Code now implemented (prototype, NOT production approval)

- `src/plugins/customer-support/ai/bot-config.ts` validates each branded Agent Bot Account and Inbox against the trusted Chatwoot site mapping; only selected brands need to enable AI.
- `src/plugins/customer-support/ai/bot-policy.ts` verifies the raw-body HMAC/timestamp, rejects non-customer messages and routes obvious orders, payments and personal information to a human.
- `src/plugins/customer-support/ai/bot-runtime.ts` retrieves and checks the current Chatwoot conversation from the branded Account before and after model selection; it atomically claims a message in libSQL and limits one conversation to 20 bot claims per day.
- `POST /api/plugins/customer-support/agent-bot/[siteId]` receives brand-specific signed callbacks and returns without rendering storefront pages or accessing Saleor GraphQL.
- The language model receives a short visitor question plus approved current-brand FAQ IDs, question titles and keywords. It may select an existing FAQ ID or none. Our server sends the published FAQ answer and URL, never model-generated policies.

## Runtime setup

Set these *server-only* variables with the corresponding existing Chatwoot support config:

- `SUPPORT_AI_BOTS_JSON`: array of `{siteId, accountId, inboxId, webhookSecret, apiToken}`. Obtain real values from the pinned Chatwoot CE installation; keys must be separate for every brand.
- `SUPPORT_AI_FAQS_JSON`: array of `{siteId, id, locale, question, answer, keywords, sourceUrl}`. A source URL must be HTTPS on that brand's configured domain.
- `SUPPORT_AI_MODEL_URL`: explicit trusted HTTPS OpenAI-compatible `/v1/chat/completions` endpoint.
- `SUPPORT_AI_MODEL_NAME` and `SUPPORT_AI_MODEL_API_KEY`: explicit model name and server-side token.
- Existing `ANALYTICS_LIBSQL_URL` and `ANALYTICS_LIBSQL_AUTH_TOKEN`: durable event claims. Bot remains disabled without a working database.

Connect the Chatwoot Agent Bot to that brand's Website Inbox and configure its callback as `https://store.example.com/api/plugins/customer-support/agent-bot/fashion` (example). The URL contains a route selector, not a proof of tenant identity. The HMAC and live Account/Inbox checks provide authorization.

## Operational limitations

- **Durable queue:** Chatwoot's default outgoing webhook timeout is 5 seconds. The signed POST does only HMAC verification and an atomic libSQL enqueue, returning 204 quickly. A **separate bearer-protected polling worker** processes at most one message per HTTP call. Uncertain failures remain failed rather than automatically replaying messages; operators need a reconciliation procedure.
- The `support_ai_delivery` table retains delivery IDs and processing statuses only, not raw chat content. Chatwoot owns conversations and attachments.
- A model selects among up to 12 current-brand FAQ records, not an arbitrary internet search. Poor matches or model outages hand off to humans.
- The `AI assistant` prefix identifies automated replies. Human handoff uses the documented Chatwoot `/toggle_status` route and requires real-version E2E verification.
- No Saleor customer, checkout, order, payment or refund permissions are granted. Do not present this integration as a verified order-status assistant.
- Never work around HMAC verification failures by disabling validation. Validate the actual Agent Bot secret on the pinned Chatwoot CE version.
- Model provider data transfers require a separate legal, privacy and consent review before enabling. The conservative string detector does not replace a full sensitive-data policy.
- Confirm actual account-scoped conversation GET, message POST, handoff POST, two-brand isolation, mobile behavior, duplicate delivery, human takeover and failure paths before production enablement.

Run `pnpm --dir storefront exec vitest run src/plugins/customer-support/ai/bot-policy.test.ts src/plugins/customer-support/ai/bot-config.test.ts` and the full CI and browser suites before merging.

### Self-hosted worker scheduling

The worker must run outside HTTP shopper requests. On the same trusted private network, schedule a protected POST to `/api/plugins/customer-support/agent-bot-worker` approximately every 5–10 seconds while operating; it reads one queued message per invocation. Use a process supervisor to manage the worker and HTTP timeouts. Never put its bearer token in a public client, URL or repository.

Illustrative invocation (use a secret sourced from your deployment vault, not a literal value):

```bash
curl --fail --silent --show-error --max-time 30 --request POST \
  -H "Authorization: Bearer ${SUPPORT_AI_WORKER_SECRET}" \
  "http://127.0.0.1:3000/api/plugins/customer-support/agent-bot-worker"
```

Start the worker **before** binding the Chatwoot Agent Bot. The worker writes a heartbeat on every poll. If no heartbeat has been recorded in the last 60 seconds, incoming callbacks fail closed instead of silently accumulating unserved conversations. Verify that the pinned Chatwoot release opens the conversation on bot webhook errors; the Chatwoot account's `keep_pending_on_bot_failure` setting can alter this behavior.

Configure short Chatwoot/model network timeouts, a restricted internal endpoint, HTTPS for external networking, queue health alarms, and a reconciliation procedure for stale processing/failed claims. A worker outage must be visible to operators; it does not affect storefront browsing or payment.

Chatwoot v4.18.0 `lib/webhooks/trigger.rb` defaults to a 5-second delivery timeout. Do not move AI inference back into the incoming Webhook route.
