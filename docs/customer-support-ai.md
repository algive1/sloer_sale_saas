# Customer Support AI extension — design only (not implemented)

This document defines a **separate, optional AI capability** for the existing system-level `customer-support` plugin. This is *not* a claim that AI chat is currently enabled.

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
