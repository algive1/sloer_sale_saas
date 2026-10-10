"""Fail-closed shared-Core customer account containment for multi-brand guest mode.

This is an *upstream GraphQL* boundary. A storefront account UI guard is not
sufficient while callers can send requests directly to Saleor /graphql/.

It does NOT make Saleor Channels independent merchant tenants: staff, apps,
checkout bearer IDs, payment integrations and webhooks need separate controls.
"""

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
