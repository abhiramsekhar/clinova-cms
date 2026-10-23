"""
cms_recepapp/urls.py
URL routing for Receptionist domain endpoints:
- /api/patients/
- /api/appointments/
- /api/bills/
- /api/payments/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PatientViewSet,
    AppointmentViewSet,
    BillViewSet,
    PaymentViewSet,
)

router = DefaultRouter()
router.register(r"patients", PatientViewSet, basename="patient")
router.register(r"appointments", AppointmentViewSet, basename="appointment")
router.register(r"bills", BillViewSet, basename="bill")
router.register(r"payments", PaymentViewSet, basename="payment")

urlpatterns = [
    path("", include(router.urls)),
]
