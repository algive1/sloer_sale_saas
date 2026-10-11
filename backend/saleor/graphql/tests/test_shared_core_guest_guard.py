from types import SimpleNamespace

import pytest
from django.test import override_settings
from graphql import GraphQLError

from saleor.core.auth import SALEOR_AUTH_HEADER
from saleor.graphql.shared_core_guest_guard import (
    BLOCKED_MUTATIONS,
    ERROR_CODE,
    CHECKOUT_GATEWAY_ERROR_CODE,
    checkout_gateway_required,
    GuestOnlySharedCoreMiddleware,
    customer_identity_blocked,
)


def request(*, user=None, app=None, token=False, checkout_key=None):
    return SimpleNamespace(
        app=app,
        user=user,
        META={
            **({SALEOR_AUTH_HEADER: "legacy-jwt"} if token else {}),
            **({"HTTP_X_PAPER_CHECKOUT_GATEWAY_SECRET": checkout_key} if checkout_key else {}),
        },
    )


def resolve(info, root=None, **kwargs):
    return "allowed"


def info(context, *, parent="Mutation", field="accountRegister"):
    return SimpleNamespace(
        context=context,
        parent_type=SimpleNamespace(name=parent),
        field_name=field,
    )


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
@override_settings(SHARED_CORE_GUEST_ONLY=True)
def test_guest_account_mutations_blocked_even_if_aliased(field):
    ctx = request()
    with pytest.raises(GraphQLError) as error:
        GuestOnlySharedCoreMiddleware().resolve(resolve, None, info(ctx, field=field))
    assert error.value.extensions["code"] == ERROR_CODE


@override_settings(
    SHARED_CORE_GUEST_ONLY=True,
    SHARED_CORE_CHECKOUT_GATEWAY_SECRET="ci-checkout-gateway-secret-long-enough-123",
)
def test_guest_catalog_still_works_but_direct_checkout_requires_server_key():
    middleware = GuestOnlySharedCoreMiddleware()
    expected_key = "ci-checkout-gateway-secret-long-enough-123"
    assert middleware.resolve(resolve, None, info(request(), parent="Query", field="products")) == "allowed"
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
        for unauthorized in (request(), request(checkout_key="wrong"), request(checkout_key="x" * 64)):
            with pytest.raises(GraphQLError) as error:
                middleware.resolve(resolve, None, info(unauthorized, parent=parent, field=field))
            assert error.value.extensions["code"] == CHECKOUT_GATEWAY_ERROR_CODE
        trusted = request(checkout_key=expected_key)
        assert middleware.resolve(resolve, None, info(trusted, parent=parent, field=field)) == "allowed"


@override_settings(SHARED_CORE_GUEST_ONLY=True, SHARED_CORE_CHECKOUT_GATEWAY_SECRET="")
def test_checkout_fails_closed_if_gateway_key_is_missing():
    with pytest.raises(GraphQLError) as error:
        GuestOnlySharedCoreMiddleware().resolve(resolve, None, info(request(), field="checkoutCreate"))
    assert error.value.extensions["code"] == CHECKOUT_GATEWAY_ERROR_CODE


@override_settings(SHARED_CORE_GUEST_ONLY=True)
def test_global_customer_jwt_cannot_query_me_or_mutate_checkout(customer_user):
    middleware = GuestOnlySharedCoreMiddleware()
    context = request(user=customer_user, token=True)
    for parent, field in (("Query", "me"), ("Mutation", "checkoutEmailUpdate"), ("User", "addresses")):
        with pytest.raises(GraphQLError) as error:
            middleware.resolve(resolve, None, info(context, parent=parent, field=field))
        assert error.value.extensions["code"] == ERROR_CODE


@override_settings(SHARED_CORE_GUEST_ONLY=True)
def test_staff_and_app_keep_dashboard_and_service_access(staff_user, app):
    middleware = GuestOnlySharedCoreMiddleware()
    for context in (request(user=staff_user, token=True), request(app=app)):
        assert middleware.resolve(resolve, None, info(context)) == "allowed"
        assert middleware.resolve(resolve, None, info(context, parent="Query", field="me")) == "allowed"
        assert middleware.resolve(resolve, None, info(context, parent="Mutation", field="checkoutComplete")) == "allowed"


@override_settings(SHARED_CORE_GUEST_ONLY=False)
def test_flag_off_preserves_legacy_single_brand_customer_behavior(customer_user):
    context = request(user=customer_user, token=True)
    assert GuestOnlySharedCoreMiddleware().resolve(resolve, None, info(context)) == "allowed"


@override_settings(SHARED_CORE_GUEST_ONLY=True)
def test_request_user_is_resolved_once_for_nested_fields(customer_user):
    context = request(user=customer_user, token=True)
    assert customer_identity_blocked(context) is True
    context.user = None
    assert customer_identity_blocked(context) is True


def test_high_risk_account_mutations_list_is_intentionally_explicit():
    assert {"accountRegister", "requestPasswordReset", "setPassword", "accountDelete", "checkoutCustomerAttach"} <= BLOCKED_MUTATIONS
    assert "checkoutCreate" not in BLOCKED_MUTATIONS
    assert "tokenCreate" not in BLOCKED_MUTATIONS  # Guarded at mutation issuance to keep staff login.
    assert "tokenVerify" not in BLOCKED_MUTATIONS  # Mutation guards its token argument to keep staff verification.
