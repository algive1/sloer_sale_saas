# Theme editor PR 2 — product detail page templates

## Design boundary

This phase extends the **existing Puck editor** to default product-detail-page
marketing content. The Saleor-owned PDP route continues rendering product
metadata, canonical SEO, gallery, SKU/variant selector, checkout actions, price,
inventory and analytics events. Puck output is appended **after** the purchase
area. Deleting a marketing block cannot delete or spoof the purchase controls.

There is a single **default** PDP content template per `site_id/channel/locale`.
Product-specific overrides, moving sections into the gallery/buy box, category
page editing and templates-by-product are intentionally deferred. Existing
published homepage themes are not migrated or reset.

## Operator behavior

In `/ops/themes`, choose `网站首页` or `商品详情页（默认模板）`.
The latter edits only below-the-purchase sections with the same asset picker,
product/collection selector, desk/mobile viewports, save draft and publish
buttons. PDP content may use Collection, Editorial, Story and Product modules,
not the homepage H1 Hero. Saving does not alter published pages.

Publishing invalidates the dynamic product route pattern only for the selected
market/locale. If storage is not configured or temporarily unavailable, the
original product commerce page renders without optional sections.

## AI-ready document contract (no AI in this phase)

A reusable page template is a versioned, strictly validated Puck document with
stable `block.props.id` values and an independent immutable server scope:
`{siteId,channel,locale,pageType,templateKey}`. Only `pageType=product` and
`templateKey=default` are enabled. `page-document.ts` owns the page-type
module allowlist. Any future AI suggestion must produce a **new draft document**
or a proposed module patch and pass the exact same validation + revision CAS
before it can ever be published by an authorized operator. No model credentials,
unrestricted HTML or execution endpoints are included.

`storefront_theme_pages` is a **new table** in the existing libSQL instance,
keyed by site/channel/locale/page_type/template_key. The old
`storefront_theme_homepages` table and its serialized V1 documents are kept
unchanged.

## Acceptance

- Homepage editor and homepage publication continue unchanged.
- Default PDP sections appear on all published product pages in the channel
  but **do not change** product price, variant selection or checkout.
- Product draft does not appear to customers until an operator publishes it.
- Page requests with foreign channel/locale, unknown page type, disallowed
  block types or stale revision fail closed.
- Brand data separation is enforced by verified Channel -> site mapping.
- Browser E2E verifies published content and retained product H1 on mobile.
- AI design, full PDP zone relocation, reusable product-specific templates,
  rollback history and other page types remain future increments.
