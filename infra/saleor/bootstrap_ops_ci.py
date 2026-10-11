"""CI-only native catalog/order credential; never use in production."""
from saleor.app.models import App, AppToken
from saleor.permission.enums import OrderPermissions, ProductPermissions
from saleor.permission.models import Permission

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
