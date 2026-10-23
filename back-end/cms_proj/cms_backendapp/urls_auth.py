"""
cms_backendapp/urls_auth.py
URL routing for auth endpoints: /login/, /me/, /refresh/, /logout/.
"""

from django.urls import path

from cms_backendapp.views_auth import (
    CustomTokenRefreshView,
    LoginView,
    LogoutView,
    MeView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth_login"),
    path("me/", MeView.as_view(), name="auth_me"),
    path("refresh/", CustomTokenRefreshView.as_view(), name="auth_refresh"),
    path("logout/", LogoutView.as_view(), name="auth_logout"),
]
