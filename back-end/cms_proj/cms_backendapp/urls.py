"""
cms_backendapp/urls.py
Main API URL dispatcher for cms_backendapp.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views_admin import (
    UserViewSet,
    StaffViewSet,
    DepartmentViewSet,
    SettingViewSet,
    AuditLogViewSet,
    NotificationViewSet,
    DashboardViewSet,
    ReportViewSet,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"staff", StaffViewSet, basename="staff")
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"settings", SettingViewSet, basename="setting")
router.register(r"audit-log", AuditLogViewSet, basename="audit-log")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"dashboard", DashboardViewSet, basename="dashboard")
router.register(r"reports", ReportViewSet, basename="report")

urlpatterns = [
    path("auth/", include("cms_backendapp.urls_auth")),
    path("", include(router.urls)),
]
