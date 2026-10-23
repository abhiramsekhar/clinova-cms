"""
cms_backendapp/views_auth.py
Authentication endpoints: login, me, refresh, logout.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import User
from cms_backendapp.serializers_auth import (
    LoginRequestSerializer,
    LogoutRequestSerializer,
    TokenRefreshRequestSerializer,
    format_user_profile,
)


class LoginView(APIView):
    """
    POST /api/auth/login/
    Authenticates user against cms_backendapp.models.User with check_password.
    Returns access, refresh tokens and user profile.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        try:
            user = User.objects.select_related("role", "staff").get(username=username)
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid username or password.", "code": "invalid_credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check account lockout if model supports it
        if hasattr(user, "locked_until") and user.locked_until and user.locked_until > timezone.now():
            return Response(
                {
                    "detail": "Account temporarily locked due to multiple failed login attempts. Please try again later.",
                    "code": "account_locked",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check active status
        if not user.is_active:
            return Response(
                {"detail": "Account is inactive. Please contact your administrator.", "code": "account_inactive"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if hasattr(user, "staff") and user.staff and not user.staff.is_active:
            return Response(
                {"detail": "Staff profile is inactive. Please contact your administrator.", "code": "staff_inactive"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Verify password
        if not user.check_password(password):
            update_fields = []
            if hasattr(user, "failed_attempts"):
                user.failed_attempts = (user.failed_attempts or 0) + 1
                update_fields.append("failed_attempts")
                if user.failed_attempts >= 5 and hasattr(user, "locked_until"):
                    user.locked_until = timezone.now() + timezone.timedelta(minutes=5)
                    update_fields.append("locked_until")
            if update_fields:
                user.save(update_fields=update_fields)

            return Response(
                {"detail": "Invalid username or password.", "code": "invalid_credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Successful login: reset failed attempts if present
        update_fields = []
        if hasattr(user, "failed_attempts") and user.failed_attempts > 0:
            user.failed_attempts = 0
            update_fields.append("failed_attempts")
        if hasattr(user, "locked_until") and user.locked_until:
            user.locked_until = None
            update_fields.append("locked_until")

        user.last_login = timezone.now()
        update_fields.append("last_login")
        user.save(update_fields=update_fields)

        # Generate SimpleJWT tokens
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": format_user_profile(user),
            },
            status=status.HTTP_200_OK,
        )


class MeView(APIView):
    """
    GET /api/auth/me/
    Returns currently authenticated user profile.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(format_user_profile(request.user), status=status.HTTP_200_OK)


class CustomTokenRefreshView(APIView):
    """
    POST /api/auth/refresh/
    Validates refresh token and returns a new access token.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TokenRefreshRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        refresh_str = serializer.validated_data["refresh"]
        try:
            refresh = RefreshToken(refresh_str)
            return Response({"access": str(refresh.access_token)}, status=status.HTTP_200_OK)
        except (InvalidToken, TokenError) as exc:
            return Response(
                {"detail": str(exc), "code": "token_invalid"},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Performs logout via client-side token discard (returns 204 No Content).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        LogoutRequestSerializer(data=request.data).is_valid()
        return Response(status=status.HTTP_204_NO_CONTENT)
