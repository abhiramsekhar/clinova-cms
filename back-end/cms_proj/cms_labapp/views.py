"""
cms_labapp/views.py
ViewSets for Lab domain:
- LabCatalogViewSet
- LabResultViewSet
"""

from rest_framework import viewsets, status
from rest_framework.pagination import PageNumberPagination

from cms_backendapp.permissions import IsRole
from cms_backendapp.models import LabTestCatalog
from .models import LabTestResult
from .serializers import LabCatalogSerializer, LabResultSerializer


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


class LabCatalogViewSet(viewsets.ModelViewSet):
    """Lab test catalog directory."""
    serializer_class = LabCatalogSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsRole("ADMIN", "DOCTOR", "LAB_TECH", "RECEPTIONIST")()]
        return [IsRole("ADMIN")()]

    def get_queryset(self):
        qs = LabTestCatalog.objects.all().order_by("test_name")
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ["true", "1"])
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__iexact=category)
        return qs


class LabResultViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for completed lab results."""
    serializer_class = LabResultSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        return [IsRole("ADMIN", "DOCTOR", "LAB_TECH")()]

    def get_queryset(self):
        qs = LabTestResult.objects.select_related("test", "test__test_catalog", "performed_by").all().order_by("-result_date", "-created_at")
        role = getattr(getattr(self.request.user, "role", None), "role_id", "")
        if role == "DOCTOR":
            staff = getattr(self.request.user, "staff", None)
            qs = qs.filter(test__doctor__staff=staff) if staff else qs.none()
        test_id = self.request.query_params.get("test") or self.request.query_params.get("testId")
        if test_id:
            qs = qs.filter(test__test_id=test_id)
        return qs
