"""
cms_doctorapp/urls.py
URL routing for Doctor domain endpoints:
- /api/doctors/
- /api/consultations/
- /api/prescriptions/
- /api/lab-orders/
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DoctorViewSet,
    ConsultationViewSet,
    PrescriptionViewSet,
    LabOrderViewSet,
)

router = DefaultRouter()
router.register(r"doctors", DoctorViewSet, basename="doctor")
router.register(r"consultations", ConsultationViewSet, basename="consultation")
router.register(r"prescriptions", PrescriptionViewSet, basename="prescription")
router.register(r"lab-orders", LabOrderViewSet, basename="lab-order")

urlpatterns = [
    path("", include(router.urls)),
]
