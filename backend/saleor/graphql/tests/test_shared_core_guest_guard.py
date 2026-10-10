from types import SimpleNamespace

import pytest
from django.test import override_settings
from graphql import GraphQLError

from saleor.core.auth import SALEOR_AUTH_HEADER
from saleor.graphql.shared_core_guest_guard import (
    BLOCKED_MUTATIONS,
    ERROR_CODE,
    GuestOnlySharedCoreMiddleware,
    customer_identity_blocked,
)


def request(*, user=None, app=None, token=False):
    return SimpleNamespace(
        app=app,
        user=user,
        META={SALEOR_AUTH_HEADER: "legacy-jwt"} if token else {},
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


@override_settings(SHARED_CORE_GUEST_ONLY=True)
def test_public_storefront_and_guest_checkout_still_work():
    middleware = GuestOnlySharedCoreMiddleware()
    context = request()
    for field in ("checkout", "products", "checkoutCreate", "checkoutLinesAdd", "checkoutComplete"):
        actual_parent = "Query" if field in ("checkout", "products") else "Mutation"
        assert middleware.resolve(resolve, None, info(context, parent=actual_parent, field=field)) == "allowed"


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
