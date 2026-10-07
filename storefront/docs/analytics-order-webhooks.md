# Analytics order webhooks

The first-party analytics layer can adjust net revenue after Saleor refunds.

Configure an **asynchronous** Saleor webhook pointing to:

`/api/analytics/saleor-order-events`

Subscribe to:

- `ORDER_REFUNDED`
- `ORDER_FULLY_REFUNDED`

Use the same secret configured as `SALEOR_WEBHOOK_SECRET`.

Recommended custom subscription:

```graphql
subscription {
  event {
    ... on OrderRefunded {
      order {
        id
        channel { slug }
        totalRefunded { amount currency }
        metadata { key value }
        lines {
          id
          productName
          variantName
          productSku
          productVariantId
          quantity
          unitPrice { gross { amount currency } }
        }
      }
    }
    ... on OrderFullyRefunded {
      order {
        id
        channel { slug }
        totalRefunded { amount currency }
        metadata { key value }
        lines {
          id
          productName
          variantName
          productSku
          productVariantId
          quantity
          unitPrice { gross { amount currency } }
        }
      }
    }
  }
}
```

The endpoint stores Saleor's cumulative `totalRefunded` per order and emits only the delta.
Repeated webhook delivery therefore does not double-count a refund.

GA4 receives a `refund` event only when the original order's
`commerce.context.origin.consent` was `granted` or `not_required`.
The first-party dashboard subtracts refund deltas from gross purchase revenue.

Google Ads conversion adjustments require Google Ads API credentials and are intentionally
not performed by this webhook yet.
