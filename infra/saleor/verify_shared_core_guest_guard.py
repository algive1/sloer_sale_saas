"""Live Saleor GraphQL regressions for shared-Core guest-only identity mode.

Run from the CI seed database:
  docker compose run --rm -T -e SALEOR_SHARED_CORE_GUEST_ONLY=true api \
    python3 manage.py shell < infra/saleor/verify_shared_core_guest_guard.py
"""

import json

from django.conf import settings
from django.test import Client

from saleor.account.models import User
from saleor.core.jwt import create_access_token, create_refresh_token

assert settings.SALEOR_SHARED_CORE_GUEST_ONLY is True, "Guest-only backend flag was not enabled"


def gql(query, variables=None, token=None):
    client = Client()
    kwargs = {"HTTP_HOST": "localhost"}
    if token:
        kwargs["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    response = client.post(
        "/graphql/",
        data=json.dumps({"query": query, "variables": variables or {}}),
        content_type="application/json",
        **kwargs,
    )
    assert response.status_code in (200, 400), (response.status_code, response.content[:1000])
    return response.json()


def assert_denied(result, label):
    errs = result.get("errors") or []
    assert any("Customer accounts are unavailable" in str(err.get("message")) for err in errs), (
        label, result
    )


customer = User.objects.create_user(
    email="guest-identity-ci@example.test", password="ci-customer-password"
)
customer.is_active = True
customer.is_confirmed = True
customer.save(update_fields=["is_active", "is_confirmed"])
customer_access = create_access_token(customer)
customer_refresh = create_refresh_token(customer)

# A visitor's pre-existing global JWT must not grant even aliased/fragmented
# GraphQL entry points. Header-based auth cannot be made per-brand by channel.
assert_denied(gql("query { oldAccount: me { id email } }", token=customer_access), "aliased me")
assert_denied(
    gql("query { ...Sensitive } fragment Sensitive on Query { me { id } }", token=customer_access),
    "fragment me",
)
assert_denied(
    gql('query { products(first: 1, channel: "us") { totalCount } }', token=customer_access),
    "customer session root catalog",
)

register = gql(
    'mutation { requestPasswordReset(email:"guest-identity-ci@example.test", '
    'redirectUrl:"http://localhost/") { errors { code } } }'
)
assert_denied(register, "anonymous password reset")
attach = gql(
    'mutation { checkoutCustomerAttach(id:"gid://saleor/Checkout/dummy") '
    '{ errors { code } } }'
)
assert_denied(attach, "anonymous checkout customer attach")

login_mutation = (
    "mutation($email: String!, $password: String!) { "
    "tokenCreate(email: $email, password: $password) { token errors { code } } }"
)
blocked_login = gql(
    login_mutation,
    {"email": customer.email, "password": "ci-customer-password"},
)
assert blocked_login.get("data", {}).get("tokenCreate", {}).get("token") is None, blocked_login

refresh = gql(
    "mutation($refresh: String!) { tokenRefresh(refreshToken: $refresh) "
    "{ token errors { code } } }",
    {"refresh": customer_refresh},
)
assert refresh.get("data", {}).get("tokenRefresh", {}).get("token") is None, refresh

verify = gql(
    "mutation($access: String!) { tokenVerify(token: $access) "
    "{ isValid errors { code } } }",
    {"access": customer_access},
)
assert verify.get("data", {}).get("tokenVerify", {}).get("isValid") is not True, verify

# Platform staff must still sign in, refresh a valid staff session and see 'me'.
staff = User.objects.get(email="admin@example.com")
assert staff.is_staff and staff.is_active
staff_access = create_access_token(staff)
staff_me = gql("query { me { email } }", token=staff_access)
assert staff_me.get("data", {}).get("me", {}).get("email") == staff.email, staff_me
staff_login = gql(login_mutation, {"email": staff.email, "password": "admin"})
assert staff_login.get("data", {}).get("tokenCreate", {}).get("token"), staff_login
staff_refreshed = gql(
    "mutation($refresh: String!) { tokenRefresh(refreshToken: $refresh) "
    "{ token errors { code } } }",
    {"refresh": create_refresh_token(staff)},
)
assert staff_refreshed.get("data", {}).get("tokenRefresh", {}).get("token"), staff_refreshed

# Public catalog and guest checkout still run without user credentials.
products = gql('query { products(first: 1, channel: "us") { edges { node { id variants { id } } } } }')
edges = products.get("data", {}).get("products", {}).get("edges", [])
assert edges, products
variant_id = next((v["id"] for e in edges for v in e["node"]["variants"]), None)
assert variant_id, products

guest_checkout = gql(
    "mutation($input: CheckoutCreateInput!) { checkoutCreate(input: $input) { "
    "checkout { id channel { slug } } errors { code } } }",
    {"input": {
        "channel": "us", "email": "new-guest@example.test",
        "lines": [{"variantId": variant_id, "quantity": 1}],
    }},
)
checkout = guest_checkout.get("data", {}).get("checkoutCreate", {}).get("checkout")
assert checkout and checkout["channel"]["slug"] == "us", guest_checkout

print("Shared-Core GraphQL guest-only negative cases, staff login/refresh and anonymous checkout: OK")
