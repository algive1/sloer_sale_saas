import graphene
from django.conf import settings
from django.core.exceptions import ValidationError
from graphene.types.generic import GenericScalar

from .....account.error_codes import AccountErrorCode
from ....core import ResolveInfo
from ....core.doc_category import DOC_CATEGORY_AUTH
from ....core.mutations import BaseMutation
from ....core.types import AccountError
from ...types import User
from .utils import get_payload, get_user


class VerifyToken(BaseMutation):
    """Mutation that confirms if token is valid and also returns user data."""

    user = graphene.Field(User, description="User assigned to token.")
    is_valid = graphene.Boolean(
        required=True,
        default_value=False,
        description="Determine if token is valid or not.",
    )
    payload = GenericScalar(description="JWT payload.")

    class Arguments:
        token = graphene.String(required=True, description="JWT token to validate.")

    class Meta:
        description = "Verify JWT token."
        doc_category = DOC_CATEGORY_AUTH
        error_type_class = AccountError
        error_type_field = "account_errors"

    @classmethod
    def get_payload(cls, token):
        try:
            payload = get_payload(token)
        except ValidationError as e:
            raise ValidationError({"token": e}) from e
        return payload

    @classmethod
    def get_user(cls, payload):
        try:
            user = get_user(payload)
        except ValidationError as e:
            raise ValidationError({"token": e}) from e
        return user

    @classmethod
    def perform_mutation(  # type: ignore[override]
        cls, _root, _info: ResolveInfo, /, *, token
    ):
        payload = cls.get_payload(token)
        user = cls.get_user(payload)
        # The token being verified is passed as an argument, not necessarily
        # as the request Authorization header. Reject global customer identities
        # here while keeping Dashboard staff token verification functional.
        if settings.SHARED_CORE_GUEST_ONLY and not user.is_staff:
            raise ValidationError(
                {"token": ValidationError(
                    "Invalid token",
                    code=AccountErrorCode.JWT_INVALID_TOKEN.value,
                )}
            )
        return cls(errors=[], user=user, is_valid=True, payload=payload)
