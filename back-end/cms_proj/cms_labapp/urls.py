"""
cms_labapp/urls.py
URL routing for Lab domain endpoints:
- /api/lab-catalog/
- /api/lab-results/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LabCatalogViewSet, LabResultViewSet

router = DefaultRouter()
router.register(r"lab-catalog", LabCatalogViewSet, basename="lab-catalog")
router.register(r"lab-results", LabResultViewSet, basename="lab-result")

urlpatterns = [
    path("", include(router.urls)),
]
