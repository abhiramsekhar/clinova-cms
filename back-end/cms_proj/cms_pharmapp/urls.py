"""
cms_pharmapp/urls.py
URL routing for Pharmacy domain endpoints:
- /api/medicines/
- /api/suppliers/
- /api/purchase-orders/
- /api/stock-ledger/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MedicineViewSet,
    SupplierViewSet,
    PurchaseOrderViewSet,
    StockLedgerViewSet,
    PharmacyPrescriptionDispenseView,
)

router = DefaultRouter()
router.register(r"medicines", MedicineViewSet, basename="medicine")
router.register(r"suppliers", SupplierViewSet, basename="supplier")
router.register(r"purchase-orders", PurchaseOrderViewSet, basename="purchase-order")
router.register(r"stock-ledger", StockLedgerViewSet, basename="stock-ledger")

urlpatterns = [
    path(
        "pharmacy-prescriptions/<str:prescription_id>/dispense/",
        PharmacyPrescriptionDispenseView.as_view(),
        name="pharmacy-prescription-dispense",
    ),
    path("", include(router.urls)),
]
