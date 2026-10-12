import base64
from types import SimpleNamespace

import pytest
from django.test import override_settings
from graphql import GraphQLError

from saleor.core.auth import SALEOR_AUTH_HEADER
from saleor.graphql.shared_core_guest_guard import (
    BLOCKED_ACCOUNT_ERROR_MESSAGE,
    BLOCKED_MUTATIONS,
    CHECKOUT_GATEWAY_ERROR_CODE,
    CHECKOUT_GATEWAY_ERROR_MESSAGE,
    CUSTOMER_IDENTITY_ERROR_MESSAGE,
    ERROR_CODE,
    GuestOnlySharedCoreMiddleware,
    checkout_gateway_required,
    customer_identity_blocked,
)

GATEWAY_SECRET = "ci-checkout-gateway-secret-long-enough-123"

guest_only = override_settings(SHARED_CORE_GUEST_ONLY=True)
gateway_enabled = override_settings(
    SHARED_CORE_GUEST_ONLY=True,
    SHARED_CORE_CHECKOUT_GATEWAY_SECRET=GATEWAY_SECRET,
)


def request(*, user=None, app=None, token=False, checkout_key=None):
    return SimpleNamespace(
        app=app,
        user=user,
        META={
            **({SALEOR_AUTH_HEADER: "legacy-jwt"} if token else {}),
            **(
                {"HTTP_X_PAPER_CHECKOUT_GATEWAY_SECRET": checkout_key}
                if checkout_key
                else {}
            ),
        },
    )


def info(context, *, parent="Mutation", field="accountRegister"):
    return SimpleNamespace(
        context=context,
        parent_type=SimpleNamespace(name=parent),
        field_name=field,
    )


class NextResolver:
    """Stand-in for the rest of the resolver chain, recording every call it gets."""

    def __init__(self):
        self.calls = []

    def __call__(self, root, info, **kwargs):
        self.calls.append(f"{info.parent_type.name}.{info.field_name}")
        return "allowed"


def assert_denied(
    next_resolver, middleware, context, *, parent, field, code, message, **kwargs
):
    with pytest.raises(GraphQLError) as error:
        middleware.resolve(
            next_resolver, None, info(context, parent=parent, field=field), **kwargs
        )

    assert error.value.extensions == {"code": code}
    assert str(error.value) == message
    # A denial must stop the request, not merely report an error after resolving it.
    assert next_resolver.calls == []


def assert_allowed(next_resolver, middleware, context, *, parent, field, **kwargs):
    result = middleware.resolve(
        next_resolver, None, info(context, parent=parent, field=field), **kwargs
    )

    assert result == "allowed"
    assert next_resolver.calls == [f"{parent}.{field}"]


@pytest.mark.parametrize(
    "field",
    [
        "accountRegister",
        "requestPasswordReset",
        "setPassword",
        "accountAddressCreate",
        "externalObtainAccessTokens",
        "checkoutCustomerAttach",
        "accountUpdate",
    ],
)
@guest_only
def test_guest_account_mutations_blocked_even_if_aliased(field):
    next_resolver = NextResolver()
    assert_denied(
        next_resolver,
        GuestOnlySharedCoreMiddleware(),
        request(),
        parent="Mutation",
        field=field,
        code=ERROR_CODE,
        message=BLOCKED_ACCOUNT_ERROR_MESSAGE,
    )


@gateway_enabled
def test_guest_catalog_still_works_but_direct_checkout_requires_server_key():
    middleware = GuestOnlySharedCoreMiddleware()
    assert_allowed(
        NextResolver(), middleware, request(), parent="Query", field="products"
    )

    for parent, field in (
        ("Query", "checkout"),
        ("Mutation", "checkoutCreate"),
        ("Mutation", "checkoutEmailUpdate"),
        ("Mutation", "checkoutComplete"),
        ("Mutation", "transactionInitialize"),
        ("Mutation", "paymentGatewayInitialize"),
        ("Checkout", "email"),  # Node/fragment traversal, not just root checkout()
        ("CheckoutLine", "quantity"),
    ):
        assert checkout_gateway_required(info(request(), parent=parent, field=field))
        for unauthorized in (
            request(),
            request(checkout_key="wrong"),
            request(checkout_key="x" * 64),
        ):
            assert_denied(
                NextResolver(),
                middleware,
                unauthorized,
                parent=parent,
                field=field,
                code=CHECKOUT_GATEWAY_ERROR_CODE,
                message=CHECKOUT_GATEWAY_ERROR_MESSAGE,
            )
        assert_allowed(
            NextResolver(),
            middleware,
            request(checkout_key=GATEWAY_SECRET),
            parent=parent,
            field=field,
        )


@override_settings(SHARED_CORE_GUEST_ONLY=True, SHARED_CORE_CHECKOUT_GATEWAY_SECRET="")
def test_checkout_fails_closed_if_gateway_key_is_missing():
    assert_denied(
        NextResolver(),
        GuestOnlySharedCoreMiddleware(),
        request(),
        parent="Mutation",
        field="checkoutCreate",
        code=CHECKOUT_GATEWAY_ERROR_CODE,
        message=CHECKOUT_GATEWAY_ERROR_MESSAGE,
    )


def global_id(type_name, pk):
    return base64.b64encode(f"{type_name}:{pk}".encode()).decode()


@pytest.mark.parametrize("field", ["updateMetadata", "deleteMetadata"])
@pytest.mark.parametrize("type_name", ["Checkout", "CheckoutLine"])
@gateway_enabled
def test_checkout_metadata_mutations_require_gateway_key(field, type_name):
    middleware = GuestOnlySharedCoreMiddleware()
    target_id = global_id(type_name, "-1")

    for unauthorized in (request(), request(checkout_key="wrong")):
        assert_denied(
            NextResolver(),
            middleware,
            unauthorized,
            parent="Mutation",
            field=field,
            code=CHECKOUT_GATEWAY_ERROR_CODE,
            message=CHECKOUT_GATEWAY_ERROR_MESSAGE,
            id=target_id,
        )
    assert_allowed(
        NextResolver(),
        middleware,
        request(checkout_key=GATEWAY_SECRET),
        parent="Mutation",
        field=field,
        id=target_id,
    )


@gateway_enabled
def test_metadata_mutations_on_other_types_stay_outside_checkout_gateway():
    middleware = GuestOnlySharedCoreMiddleware()
    assert_allowed(
        NextResolver(),
        middleware,
        request(),
        parent="Mutation",
        field="updateMetadata",
        id=global_id("Product", "-1"),
    )
    assert_allowed(
        NextResolver(),
        middleware,
        request(),
        parent="Mutation",
        field="deleteMetadata",
        id="not-a-global-id",
    )


@guest_only
def test_global_customer_jwt_cannot_query_me_or_mutate_checkout(customer_user):
    middleware = GuestOnlySharedCoreMiddleware()

    for parent, field in (
        ("Query", "me"),
        ("Mutation", "checkoutEmailUpdate"),
        ("User", "addresses"),
    ):
        assert_denied(
            NextResolver(),
            middleware,
            request(user=customer_user, token=True),
            parent=parent,
            field=field,
            code=ERROR_CODE,
            message=CUSTOMER_IDENTITY_ERROR_MESSAGE,
        )


@guest_only
def test_staff_and_app_keep_dashboard_and_service_access(staff_user, app):
    middleware = GuestOnlySharedCoreMiddleware()

    for context in (request(user=staff_user, token=True), request(app=app)):
        for parent, field in (
            ("Mutation", "accountRegister"),
            ("Mutation", "checkoutCustomerAttach"),
            ("Mutation", "checkoutComplete"),
            ("Query", "me"),
        ):
            assert_allowed(
                NextResolver(), middleware, context, parent=parent, field=field
            )


@override_settings(SHARED_CORE_GUEST_ONLY=False)
def test_flag_off_preserves_legacy_single_brand_customer_behavior(customer_user):
    assert_allowed(
        NextResolver(),
        GuestOnlySharedCoreMiddleware(),
        request(user=customer_user, token=True),
        parent="Mutation",
        field="accountRegister",
    )


@guest_only
def test_request_user_is_resolved_once_for_nested_fields(customer_user):
    context = request(user=customer_user, token=True)
    assert customer_identity_blocked(context) is True

    # The lazy JWT user is resolved once per request; later field lookups must reuse
    # that verdict instead of re-querying the now-cleared user.
    context.user = None
    assert customer_identity_blocked(context) is True
    assert context._shared_core_customer_blocked is True


def test_high_risk_account_mutations_list_is_intentionally_explicit():
    assert {
        "accountRegister",
        "requestPasswordReset",
        "setPassword",
        "accountDelete",
        "checkoutCustomerAttach",
    } <= BLOCKED_MUTATIONS
    assert "checkoutCreate" not in BLOCKED_MUTATIONS
    # Guarded at mutation issuance to keep staff login.
    assert "tokenCreate" not in BLOCKED_MUTATIONS
    # The mutation guards its token argument to keep staff verification.
    assert "tokenVerify" not in BLOCKED_MUTATIONS
