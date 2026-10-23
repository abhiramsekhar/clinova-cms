"""
cms_backendapp/authentication.py
Custom JWT authentication backend resolving against cms_backendapp.models.User.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken

from cms_backendapp.models import User


class CustomJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication that resolves the authenticated user
    from the project's own `users` table (cms_backendapp.models.User).
    """

    def get_user(self, validated_token):
        user_id = validated_token.get("user_id")
        if not user_id:
            raise InvalidToken("Token contained no recognizable user identification")

        try:
            user = User.objects.select_related("role", "staff").get(user_id=user_id)
        except User.DoesNotExist:
            raise AuthenticationFailed("User not found", code="user_not_found")

        if not user.is_active:
            raise AuthenticationFailed("User account is inactive", code="user_inactive")

        if hasattr(user, "staff") and user.staff and not user.staff.is_active:
            raise AuthenticationFailed("Staff profile is inactive", code="staff_inactive")

        return user
