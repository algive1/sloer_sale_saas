# Phase 1 — transaction baseline

The first milestone is a complete, unstyled transaction path.

## Definition of done

A user can:

1. Open a product listing.
2. Open a PDP.
3. Select a variant.
4. Add it to cart.
5. Start guest checkout.
6. Enter address.
7. Select shipping.
8. Complete a test payment.
9. See order confirmation.
10. The order appears correctly in Saleor Dashboard.

## Scope

Included:

- US channel
- English
- USD
- product / variant / SKU model
- inventory
- guest checkout
- dummy payment first
- Stripe test mode second
- baseline SEO validation
- automated verification

Explicitly deferred:

- visual redesign
- additional countries
- additional languages
- Google Ads campaigns
- Klaviyo
- Chatwoot
- Algolia
- B2B quote flows

## Quality gates

Before visual redesign:

- checkout E2E passes
- typecheck passes
- lint passes
- no secrets committed
- canonical / hreflang strategy documented
- sitemap / robots work is tracked
