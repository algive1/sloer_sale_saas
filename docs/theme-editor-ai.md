# AI-assisted visual theme editor

## Scope

Operators can use the existing Puck editor to:
1. Add encrypted AI providers in the new AI drawer; use OpenAI official or an explicitly approved OpenAI-compatible API gateway, and choose each provider's model ID.
2. Switch an active provider per **brand** without exposing API keys to the browser.
3. Chat to generate a homepage / PDP marketing-section draft, or select one existing module and ask AI to revise only that module.
4. Preview generated changes directly in the center Puck canvas. Undo the last AI preview, edit by hand, save as draft or reusable template, and publish separately.

The existing Saleor buy box, SKU, pricing, inventory and checkout are never provided as editable AI components. AI may not invent product data, reviews, shipment promises, image URLs, or third-party checkout links. Runtime validation enforces allowed Puck fields, block IDs and product page types.

## Self-hosted configuration

- Reuse a configured `THEME_LIBSQL_URL` + `THEME_LIBSQL_AUTH_TOKEN`, or the existing `ANALYTICS_LIBSQL_*` fallback.
- Configure `THEME_AI_ENCRYPTION_KEY` with a persistent 32-byte hex value (e.g. generate on the server using `openssl rand -hex 32`). Keep a secure backup; **changing this key makes previously saved API credentials undecryptable**.
- Official OpenAI `https://api.openai.com/v1` is an allowed endpoint by default.
- Approve a compatible third-party gateway with `THEME_AI_ALLOWED_ENDPOINTS=https://gateway.example.com/v1,https://other.example.org/openai/v1`. Only exact HTTPS base URLs explicitly listed there appear as choices in the editor. No localhost, IP address, credential-bearing URLs, query strings, arbitrary UI-provided addresses or redirects.
- In `/ops/themes`, open **AI 设计 → 模型设置**; enter name, approved endpoint, model ID and API Key. Multiple profiles can coexist (max 8 per brand); click **启用** to switch.
- API keys are encrypted using AES-256-GCM and only decrypted on the Next.js server at request time. They are never returned in GET responses or logs. Do not put API keys in `NEXT_PUBLIC_*` variables.
- The deployment's `/ops` Basic authentication / platform-admin permission checks must be enabled and protected by HTTPS. Put a shared rate/quota limit on `/ops/themes/ai/generate` in the reverse proxy for horizontally scaled installations; app enforces a local 12-second cooldown per brand/provider.
- Usage and costs are billed by the configured AI provider, not by the application. Avoid sending sensitive customer data or unreleased private product information through prompts.

## API compatibility

The MVP uses `POST {baseUrl}/chat/completions`, standard `Authorization: Bearer`, and chat message arrays. The official OpenAI profile requests JSON object mode; compatible gateways are prompted for strict JSON without requiring the optional `response_format` parameter. Provider/model feature support varies, so select models capable of JSON text outputs. The server limits request size, response size and execution duration.

New API endpoints (protected by `/ops`):
- `GET/POST/DELETE /ops/themes/ai/providers` — list/create/activate/delete profiles. Never returns secrets.
- `POST /ops/themes/ai/generate` — accepts channel, locale, pageType, mode, selected block ID, current validated Puck document, recent design conversation and user prompt; returns a **validated proposed document**, not published HTML.

This is a working conversational design MVP; future improvements can add model capability discovery, chat threads persisted across sessions, extra module classes, cost dashboards and A/B testing. Existing site template storage and publication stay unchanged.
