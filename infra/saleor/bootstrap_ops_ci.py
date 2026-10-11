"""CI-only app credential for native catalog inspection; never use in production."""
from saleor.app.models import App, AppToken
from saleor.permission.enums import ProductPermissions
from saleor.permission.models import Permission

app, _ = App.objects.get_or_create(
    identifier="commerce-ops-ci",
    defaults={"name": "Commerce Ops CI", "is_active": True},
)
app.is_active = True
app.save(update_fields=["is_active"])
label, codename = ProductPermissions.MANAGE_PRODUCTS.value.split(".")
app.permissions.set(Permission.objects.filter(content_type__app_label=label, codename=codename))
if app.permissions.count() != 1:
    raise RuntimeError("Catalog CI app permission missing")
app.tokens.all().delete()
_, raw_token = AppToken.objects.create(app=app, name="isolated-ci")
if len(raw_token) != 30:
    raise RuntimeError("Native app token shape mismatch")
print(raw_token)
