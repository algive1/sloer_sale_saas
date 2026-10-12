"""Native signed cache delivery fixture; disposable CI only."""
import os

from saleor.app.models import App
from saleor.permission.enums import ProductPermissions
from saleor.permission.models import Permission
from saleor.webhook.event_types import WebhookEventAsyncType
from saleor.webhook.models import Webhook, WebhookEvent

if os.environ.get("CI_NATIVE_CACHE_SEED") != "true":
    raise RuntimeError("Cache fixture requires a disposable CI database")
secret = os.environ.get("CI_NATIVE_WEBHOOK_SECRET", "")
if len(secret) < 32:
    raise RuntimeError("Native cache HMAC key is missing")
if App.objects.filter(identifier="ci-storefront-cache").exists():
    raise RuntimeError("Cache fixture must be created once")
app = App.objects.create(identifier="ci-storefront-cache", name="CI native cache", is_active=True)
label, codename = ProductPermissions.MANAGE_PRODUCTS.value.split(".")
app.permissions.set([Permission.objects.get(content_type__app_label=label, codename=codename)])
webhook = Webhook.objects.create(
    app=app, name="CI ProductUpdated cache", identifier="ci-catalog-published",
    target_url="http://host.docker.internal:3103/api/revalidate", secret_key=secret,
    # Deliberately omit channel context, like native global events. The actual
    # Saleor producer must refresh jewelry as well as the default US market.
    subscription_query="subscription { event { ... on ProductUpdated { product { slug } } } }",
)
WebhookEvent.objects.create(webhook=webhook, event_type=WebhookEventAsyncType.PRODUCT_UPDATED)
print("Native ProductUpdated cache webhook created; no app token required")
