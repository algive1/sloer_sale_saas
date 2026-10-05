from decimal import Decimal

from saleor.channel.models import Channel
from saleor.product.models import (
    CollectionChannelListing,
    ProductChannelListing,
    ProductVariantChannelListing,
)
from saleor.shipping import ShippingMethodType
from saleor.shipping.models import (
    ShippingMethod,
    ShippingMethodChannelListing,
    ShippingZone,
)
from saleor.tax.models import TaxConfiguration

source = Channel.objects.filter(slug="default-channel").first()
if source is None:
    source = Channel.objects.order_by("pk").first()
if source is None:
    raise RuntimeError("No source channel exists. Run populatedb first.")

channel, created = Channel.objects.get_or_create(
    slug="us",
    defaults={
        "name": "United States",
        "is_active": True,
        "currency_code": "USD",
        "default_country": "US",
        "allocation_strategy": source.allocation_strategy,
        "order_mark_as_paid_strategy": source.order_mark_as_paid_strategy,
        "default_transaction_flow_strategy": source.default_transaction_flow_strategy,
        "automatically_confirm_all_new_orders": source.automatically_confirm_all_new_orders,
        "allow_unpaid_orders": source.allow_unpaid_orders,
        "use_legacy_error_flow_for_checkout": source.use_legacy_error_flow_for_checkout,
        "use_legacy_line_discount_propagation_for_order": source.use_legacy_line_discount_propagation_for_order,
    },
)

channel.name = "United States"
channel.is_active = True
channel.currency_code = "USD"
channel.default_country = "US"
channel.save()

TaxConfiguration.objects.get_or_create(channel=channel)

# Reuse populatedb warehouses/stocks, but make shipping deterministic for US/USD.
# The source shipping-method listings are channel/currency scoped, so merely copying
# the source zones would leave the US checkout without an applicable delivery method.
source_warehouses = source.warehouses.all()
channel.warehouses.set(source_warehouses)
channel.shipping_zones.set(source.shipping_zones.all())

shipping_zone, _ = ShippingZone.objects.update_or_create(
    name="US Integration",
    defaults={
        "countries": ["US"],
        "default": False,
        "description": "Deterministic US shipping zone for local and CI integration tests.",
    },
)
shipping_zone.channels.add(channel)
shipping_zone.warehouses.set(source_warehouses)

shipping_method, _ = ShippingMethod.objects.update_or_create(
    shipping_zone=shipping_zone,
    name="US Standard Shipping",
    defaults={
        "type": ShippingMethodType.PRICE_BASED,
        "minimum_delivery_days": 3,
        "maximum_delivery_days": 7,
    },
)
ShippingMethodChannelListing.objects.update_or_create(
    shipping_method=shipping_method,
    channel=channel,
    defaults={
        "currency": "USD",
        "price_amount": Decimal("5.99"),
        "minimum_order_price_amount": Decimal("0.00"),
        "maximum_order_price_amount": None,
    },
)

for listing in ProductChannelListing.objects.filter(channel=source):
    ProductChannelListing.objects.update_or_create(
        product=listing.product,
        channel=channel,
        defaults={
            "is_published": listing.is_published,
            "published_at": listing.published_at,
            "visible_in_listings": listing.visible_in_listings,
            "available_for_purchase_at": listing.available_for_purchase_at,
            "currency": "USD",
            "discounted_price_amount": listing.discounted_price_amount,
            "discounted_price_dirty": listing.discounted_price_dirty,
        },
    )

for listing in ProductVariantChannelListing.objects.filter(channel=source):
    ProductVariantChannelListing.objects.update_or_create(
        variant=listing.variant,
        channel=channel,
        defaults={
            "currency": "USD",
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
        channel=channel,
        defaults={
            "is_published": listing.is_published,
            "published_at": listing.published_at,
        },
    )

print(
    {
        "channel": channel.slug,
        "created": created,
        "products": ProductChannelListing.objects.filter(channel=channel).count(),
        "variants": ProductVariantChannelListing.objects.filter(channel=channel).count(),
        "collections": CollectionChannelListing.objects.filter(channel=channel).count(),
        "warehouses": channel.warehouses.count(),
        "shipping_zones": channel.shipping_zones.count(),
        "shipping_methods": ShippingMethod.objects.for_channel(channel.slug).count(),
    }
)
