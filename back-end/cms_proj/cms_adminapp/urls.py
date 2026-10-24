"""Admin API routes, mounted by the project at ``/api/admin/``."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminAuditLogViewSet,
    AdminDashboardViewSet,
    AdminDepartmentViewSet,
    AdminGlobalSearchView,
    AdminLabCatalogViewSet,
    AdminReportsViewSet,
    AdminRoleViewSet,
    AdminSettingView,
    AdminStaffViewSet,
    AdminSupplierViewSet,
    AdminUserViewSet,
)

router = DefaultRouter()
router.register("users", AdminUserViewSet, basename="admin-user")
router.register("roles", AdminRoleViewSet, basename="admin-role")
router.register("staff", AdminStaffViewSet, basename="admin-staff")
router.register("departments", AdminDepartmentViewSet, basename="admin-department")
router.register("lab-catalog", AdminLabCatalogViewSet, basename="admin-lab-catalog")
router.register("suppliers", AdminSupplierViewSet, basename="admin-supplier")
router.register("audit-log", AdminAuditLogViewSet, basename="admin-audit-log")
router.register("dashboard", AdminDashboardViewSet, basename="admin-dashboard")
router.register("reports", AdminReportsViewSet, basename="admin-report")

urlpatterns = [
    path("search/", AdminGlobalSearchView.as_view(), name="admin-global-search"),
    path("settings/", AdminSettingView.as_view(), name="admin-settings"),
    path("", include(router.urls)),
] 
