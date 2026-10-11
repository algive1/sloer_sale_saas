"""Fail-closed shared-Core customer account containment for multi-brand guest mode.

This is an *upstream GraphQL* boundary. A storefront account UI guard is not
sufficient while callers can send requests directly to Saleor /graphql/.

It does NOT make Saleor Channels independent merchant tenants: staff, apps,
checkout bearer IDs, payment integrations and webhooks need separate controls.
"""

from hmac import compare_digest

from django.conf import settings
from graphql import GraphQLError
from jwt import InvalidTokenError

from ..core.auth import get_token_from_request

ERROR_CODE = "SHARED_CORE_CUSTOMER_ACCOUNTS_DISABLED"

# Do not permit anonymous callers to register, reset or change global Saleor
# customer identities via direct GraphQL. GraphQL field names, not operation
# names or aliases, are authoritative at resolver time (fragments cannot bypass).
BLOCKED_MUTATIONS = frozenset(
    {
        "tokensDeactivateAll",
        "requestPasswordReset",
        "sendConfirmationEmail",
        "confirmAccount",
        "setPassword",
        "passwordChange",
        "requestEmailChange",
        "confirmEmailChange",
        "accountAddressCreate",
        "accountAddressUpdate",
        "accountAddressDelete",
        "accountSetDefaultAddress",
        "accountRegister",
        "accountUpdate",
        "accountRequestDeletion",
        "accountDelete",
        "externalAuthenticationUrl",
        "externalObtainAccessTokens",
        "externalRefresh",
        "externalLogout",
        "externalVerify",
        "checkoutCustomerAttach",
        "checkoutCustomerDetach",
    }
)


# Checkout UUIDs are bearer identifiers; public Saleor GraphQL must not accept
# them independently of the Host-verified Paper server actions. Query.node and
# aliases/fragments are covered by checking the actual GraphQL parent type.
CHECKOUT_ROOT_QUERIES = frozenset({"checkout"})
CHECKOUT_OBJECT_TYPES = frozenset({"Checkout", "CheckoutLine"})
CHECKOUT_ROOT_MUTATIONS = frozenset({
    "orderCreateFromCheckout",
    "paymentGatewayInitialize",
    "transactionInitialize",
    "transactionProcess",
    "transactionRequestAction",
})
CHECKOUT_GATEWAY_ERROR_CODE = "SHARED_CORE_CHECKOUT_GATEWAY_REQUIRED"


def checkout_gateway_required(info) -> bool:
    parent = info.parent_type.name
    field = info.field_name
    return (
        parent in CHECKOUT_OBJECT_TYPES
        or parent == "Query" and field in CHECKOUT_ROOT_QUERIES
        or parent == "Mutation" and (
            field.startswith("checkout") or field in CHECKOUT_ROOT_MUTATIONS
        )
    )


def checkout_gateway_allowed(context) -> bool:
    # Saleor's own staff/app permission checks still apply. Do not treat an
    # anonymous user as staff just because a caller supplied identity headers.
    if context.app:
        return True
    if get_token_from_request(context) and context.user and context.user.is_staff:
        return True

    expected = settings.SHARED_CORE_CHECKOUT_GATEWAY_SECRET
    received = context.META.get("HTTP_X_PAPER_CHECKOUT_GATEWAY_SECRET", "")
    return (
        len(expected) >= 32
        and isinstance(received, str)
        and compare_digest(expected, received)
    )


def customer_identity_blocked(context) -> bool:
    """Return True for a customer JWT, but retain app and staff GraphQL access.

    Cache per request, not globally: resolving the lazy JWT user costs a DB
    lookup. Anonymous checkouts do not carry a JWT and stay on the fast path.
    """
    if hasattr(context, "_shared_core_customer_blocked"):
        return context._shared_core_customer_blocked

    if context.app or not get_token_from_request(context):
        blocked = False
    else:
        try:
            user = context.user
            blocked = bool(user) and not user.is_staff
        except InvalidTokenError:
            # The upstream authentication implementation will reject bad JWTs.
            blocked = False

    context._shared_core_customer_blocked = blocked
    return blocked


class GuestOnlySharedCoreMiddleware:
    """Block global customer identities before GraphQL resolvers execute."""

    def resolve(self, next, root, info, **kwargs):
        if not settings.SHARED_CORE_GUEST_ONLY:
            return next(root, info, **kwargs)

        context = info.context
        if customer_identity_blocked(context):
            raise GraphQLError(
                "Customer accounts are unavailable in shared-Core multi-brand mode.",
                extensions={"code": ERROR_CODE},
            )

        # Direct public GraphQL cannot bypass the Host+Channel checks in Paper
        # just by presenting a leaked Checkout ID. A wrong/missing key fails
        # closed, including when this request is a node/fragment traversal.
        if checkout_gateway_required(info) and not checkout_gateway_allowed(context):
            raise GraphQLError(
                "Checkout operations require the trusted storefront gateway.",
                extensions={"code": CHECKOUT_GATEWAY_ERROR_CODE},
            )

        # Staff/app requests retain their original permissions. TokenCreate and
        # TokenRefresh and TokenVerify have staff-only guards in their mutations.
        if (
            info.parent_type.name == "Mutation"
            and info.field_name in BLOCKED_MUTATIONS
            and not context.app
        ):
            # No JWT => anonymous and certainly not staff.
            if not get_token_from_request(context) or not context.user or not context.user.is_staff:
                raise GraphQLError(
                    "Customer account operations are unavailable in shared-Core multi-brand mode.",
                    extensions={"code": ERROR_CODE},
                )

        return next(root, info, **kwargs)
