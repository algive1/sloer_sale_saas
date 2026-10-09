"""CI-only second brand Channel, seeded with a deliberately smaller catalog.

Runs after bootstrap_us.py and bootstrap_theme_collection.py. The two channels
share Saleor Core but have distinct publication listings, which lets the
browser test prove that a foreign brand's product is not exposed on this host.
Do not use this script in merchant production deployments.
"""
from saleor.channel.models import Channel
from saleor.product.models import (
    CollectionChannelListing,
    ProductChannelListing,
    ProductVariantChannelListing,
)
from saleor.tax.models import TaxConfiguration

source = Channel.objects.get(slug="us")
brand, created = Channel.objects.get_or_create(
    slug="jewelry-us",
    defaults={
        "name": "Jewelry CI US",
        "is_active": True,
        "currency_code": source.currency_code,
        "default_country": source.default_country,
        "allocation_strategy": source.allocation_strategy,
        "order_mark_as_paid_strategy": source.order_mark_as_paid_strategy,
        "default_transaction_flow_strategy": source.default_transaction_flow_strategy,
        "automatically_confirm_all_new_orders": source.automatically_confirm_all_new_orders,
        "allow_unpaid_orders": source.allow_unpaid_orders,
        "use_legacy_error_flow_for_checkout": source.use_legacy_error_flow_for_checkout,
        "use_legacy_line_discount_propagation_for_order": source.use_legacy_line_discount_propagation_for_order,
    },
)
brand.is_active = True
brand.save()
TaxConfiguration.objects.get_or_create(channel=brand)
brand.warehouses.set(source.warehouses.all())
brand.shipping_zones.set(source.shipping_zones.all())

# A small subset of the products in the fashion channel is published to
# jewelry. Fashion retains the entire original population.
source_products = list(
    ProductChannelListing.objects.filter(channel=source, is_published=True)
    .order_by("product_id")[:3]
)
if len(source_products) < 2:
    raise RuntimeError("Multi-brand CI needs at least two published products")
product_ids = []
for listing in source_products:
    product_ids.append(listing.product_id)
    ProductChannelListing.objects.update_or_create(
        product_id=listing.product_id,
        channel=brand,
        defaults={
            "is_published": listing.is_published,
            "published_at": listing.published_at,
            "visible_in_listings": listing.visible_in_listings,
            "available_for_purchase_at": listing.available_for_purchase_at,
            "currency": listing.currency,
            "discounted_price_amount": listing.discounted_price_amount,
            "discounted_price_dirty": listing.discounted_price_dirty,
        },
    )

for listing in ProductVariantChannelListing.objects.filter(
    channel=source, variant__product_id__in=product_ids
):
    ProductVariantChannelListing.objects.update_or_create(
        variant=listing.variant,
        channel=brand,
        defaults={
            "currency": listing.currency,
            "price_amount": listing.price_amount,
            "cost_price_amount": listing.cost_price_amount,
            "prior_price_amount": listing.prior_price_amount,
            "discounted_price_amount": listing.discounted_price_amount,
            "preorder_quantity_threshold": listing.preorder_quantity_threshold,
        },
    )

for listing in CollectionChannelListing.objects.filter(channel=source):
    CollectionChannelListing.objects.update_or_create(
        collection=listing.collection,
        channel=brand,
        defaults={"is_published": listing.is_published, "published_at": listing.published_at},
    )

print({
    "brand": brand.slug,
    "created": created,
    "catalog": len(product_ids),
    "fashion_catalog": ProductChannelListing.objects.filter(channel=source, is_published=True).count(),
})
