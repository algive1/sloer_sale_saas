"""CI-only demo content for the theme-builder Saleor collection E2E.

Requires populatedb and bootstrap_us.py. Creates a published collection whose
slug matches the fashion template, using real US-channel products.
"""
from django.utils import timezone
from saleor.channel.models import Channel
from saleor.product.models import Collection, CollectionChannelListing, Product

channel = Channel.objects.get(slug="us")
products = list(
    Product.objects.filter(channel_listings__channel=channel, channel_listings__is_published=True)
    .distinct()
    .order_by("pk")[:8]
)
if not products:
    raise RuntimeError("Theme E2E requires published products in the US channel")
collection, _ = Collection.objects.get_or_create(
    slug="featured-products", defaults={"name": "Theme E2E Featured Products"}
)
collection.products.add(*products)
CollectionChannelListing.objects.update_or_create(
    collection=collection,
    channel=channel,
    defaults={"is_published": True, "published_at": timezone.now()},
)
print({"theme_featured_collection": collection.slug, "product_count": len(products)})
