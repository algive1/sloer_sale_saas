"""Disposable CI fixture for the real native Dashboard bulk workflow."""
import json
import os
from decimal import Decimal

import graphene

from saleor.account.models import User
from saleor.channel.models import Channel
from saleor.core.jwt import create_refresh_token
from saleor.product.models import (
    Product,
    ProductChannelListing,
    ProductVariant,
    ProductVariantChannelListing,
)

if os.environ.get("CI_NATIVE_BULK_SEED") != "true":
    raise RuntimeError("Bulk fixture is restricted to a disposable CI database")
channel = Channel.objects.get(slug="jewelry-us")
source = Product.objects.filter(channel_listings__channel=channel, category__isnull=False).first()
if source is None or Product.objects.filter(slug="ci-bulk-safety").exists():
    raise RuntimeError("Bulk fixture requires an unused disposable catalog")
product = Product.objects.create(
    name="AA CI bulk safety",
    slug="ci-bulk-safety",
    product_type=source.product_type,
    category=source.category,
)
ProductChannelListing.objects.create(
    product=product, channel=channel, currency=channel.currency_code,
    is_published=False, visible_in_listings=False,
)
for index in range(101):
    variant = ProductVariant.objects.create(
        product=product, name=f"CI variant {index}", sku=f"CI-BULK-SAFETY-{index}",
        track_inventory=False,
    )
    ProductVariantChannelListing.objects.create(
        variant=variant, channel=channel, currency=channel.currency_code,
        price_amount=Decimal("19.99"),
    )
staff = User.objects.create(
    email="ci-bulk-staff@example.test", is_staff=True, is_superuser=True,
    is_active=True, is_confirmed=True,
)
staff.set_unusable_password()
staff.save(update_fields=["password"])
print(json.dumps({
    "refreshToken": create_refresh_token(staff, {"csrfToken": "ci-bulk-only"}),
    "channelId": graphene.Node.to_global_id("Channel", channel.pk),
    "productId": graphene.Node.to_global_id("Product", product.pk),
}))
