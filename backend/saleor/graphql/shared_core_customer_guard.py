"""Contain shared-Core customer identity at the Saleor GraphQL resolver boundary.

Channels are not Saleor customer tenants. In multi-brand guest-only mode, a
direct /graphql/ request must not bypass Paper's disabled account routes.
Resolve on schema field names (not operation strings) so aliases, fragments,
variable inputs and batched operations cannot evade the policy.
"""

from django.conf import settings
from graphql import GraphQLError

CUSTOMER_IDENTITY_UNAVAILABLE = "SHARED_CORE_CUSTOMER_IDENTITY_UNAVAILABLE"

# This is a containment list, not full tenant RBAC. Platform staff may manage
# global identities, but untrusted customer sessions and anonymous callers may
# not register, reset, attach, mutate or read a shared-Core customer account.
CUSTOMER_ACCOUNT_MUTATIONS = frozenset(
    {
        "accountRegister",
        "accountUpdate",
        "accountDelete",
        "accountRequestDeletion",
        "accountAddressCreate",
        "accountAddressUpdate",
        "accountAddressDelete",
        "accountSetDefaultAddress",
        "passwordChange",
        "requestPasswordReset",
        "setPassword",
        "sendConfirmationEmail",
        "confirmAccount",
        "requestEmailChange",
        "confirmEmailChange",
        "tokensDeactivateAll",
        "checkoutCustomerAttach",
        "checkoutCustomerDetach",
        # External identity plugins issue global credentials without per-brand
        # claims. Disable even for staff until each plugin can prove isolation.
        "externalAuthenticationUrl",
        "externalObtainAccessTokens",
        "externalRefresh",
        "externalLogout",
        "externalVerify",
    }
)


class SharedCoreGuestCustomerGuard:
    """Protect public GraphQL regardless of the caller's storefront Host."""

    def resolve(self, next_, root, info, **kwargs):
        if not settings.SALEOR_SHARED_CORE_GUEST_ONLY:
            return next_(root, info, **kwargs)

        user = getattr(info.context, "user", None)
        is_staff = bool(user and getattr(user, "is_staff", False))
        parent_type = info.parent_type.name
        field = info.field_name

        # Existing customer JWTs (including cookies from a previously deployed
        # single-brand site) are global. Reject the whole root operation under
        # a customer identity; the same visitor can use anonymous catalog and
        # guest checkout without forwarding any customer credentials.
        if (
            parent_type in {"Query", "Mutation"}
            and user
            and getattr(user, "is_authenticated", False)
            and not is_staff
        ):
            raise GraphQLError(
                "Customer accounts are unavailable in shared-Core guest-only mode.",
                extensions={"code": CUSTOMER_IDENTITY_UNAVAILABLE},
            )

        if parent_type == "Mutation" and field in CUSTOMER_ACCOUNT_MUTATIONS:
            if field.startswith("external") or field == "accountRegister" or not is_staff:
                raise GraphQLError(
                    "Customer accounts are unavailable in shared-Core guest-only mode.",
                    extensions={"code": CUSTOMER_IDENTITY_UNAVAILABLE},
                )

        return next_(root, info, **kwargs)
