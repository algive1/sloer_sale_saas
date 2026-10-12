"""CI-only native catalog/order credential; never use in production."""
from decimal import Decimal
from saleor.app.models import App, AppToken
from saleor.channel.models import Channel
from saleor.permission.enums import OrderPermissions, ProductPermissions
from saleor.permission.models import Permission
from saleor.product.models import (
    Product,
    ProductChannelListing,
    ProductVariant,
    ProductVariantChannelListing,
)

# Existing jewelry products also belong to fashion. Seed one genuinely disjoint
# SKU to test global lookup without confusing shared products with foreign ones.
# Never run this fixture bootstrap against production.
brand = Channel.objects.get(slug="jewelry-us")
source = Product.objects.filter(channel_listings__channel=brand).first()
if source is None:
    raise RuntimeError("Preflight fixture requires the jewelry brand catalog")
product, _ = Product.objects.get_or_create(
    slug="ci-preflight-jewelry-only",
    defaults={
        "name": "CI preflight jewelry only",
        "product_type": source.product_type,
        "category": source.category,
        "weight": source.weight,
    },
)
variant, _ = ProductVariant.objects.get_or_create(
    sku="CI-PREFLIGHT-JEWELRY-ONLY",
    defaults={"product": product, "name": "CI preflight", "track_inventory": False},
)
if variant.product_id != product.pk:
    raise RuntimeError("Preflight fixture SKU collision")
ProductChannelListing.objects.get_or_create(
    product=product,
    channel=brand,
    defaults={"currency": brand.currency_code},
)
ProductVariantChannelListing.objects.get_or_create(
    variant=variant,
    channel=brand,
    defaults={"currency": brand.currency_code, "price_amount": Decimal("19.99")},
)
if (
    product.channel_listings.exclude(channel=brand).exists()
    or variant.channel_listings.exclude(channel=brand).exists()
):
    raise RuntimeError("Preflight fixture must belong only to jewelry")

app, _ = App.objects.get_or_create(
    identifier="commerce-ops-ci",
    defaults={"name": "Commerce Ops CI", "is_active": True},
)
app.is_active = True
app.save(update_fields=["is_active"])
permissions = []
for value in [ProductPermissions.MANAGE_PRODUCTS.value, OrderPermissions.MANAGE_ORDERS.value]:
    label, codename = value.split(".")
    permissions.append(Permission.objects.get(content_type__app_label=label, codename=codename))
app.permissions.set(permissions)
if app.permissions.count() != 2:
    raise RuntimeError("Operations CI app permission missing")
app.tokens.all().delete()
_, raw_token = AppToken.objects.create(app=app, name="isolated-ci")
if len(raw_token) != 30:
    raise RuntimeError("Native app token shape mismatch")
print(raw_token)
