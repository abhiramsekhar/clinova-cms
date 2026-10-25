"""
cms_backendapp/views_admin.py
ViewSets for Admin & System Domain:
- UserViewSet
- StaffViewSet
- DepartmentViewSet
- SettingViewSet
- AuditLogViewSet
- NotificationViewSet
- DashboardViewSet
- ReportViewSet
"""

import datetime
from decimal import Decimal
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Sum, Count
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from .audit import log_audit
from .permissions import IsRole, IsAdmin
from .models import User, Staff, Department, Setting, AuditLog, Notification, Role
from .serializers_admin import (
    UserSerializer,
    StaffSerializer,
    DepartmentSerializer,
    SettingSerializer,
    AuditLogSerializer,
    NotificationSerializer,
)


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


class UserViewSet(viewsets.ModelViewSet):
    """User account management (ADMIN only)."""
    serializer_class = UserSerializer
    pagination_class = StandardPagination
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return User.objects.select_related("role", "staff").all().order_by("username")

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        new_pw = request.data.get("password") or request.data.get("newPassword")
        if not new_pw:
            return Response({"detail": "Password is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from django.contrib.auth.password_validation import validate_password
            validate_password(new_pw, user=user)
        except DjangoValidationError as error:
            return Response({"password": error.messages}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_pw)
        user.failed_attempts = 0
        user.locked_until = None
        user.save(update_fields=["password_hash", "failed_attempts", "locked_until"])

        log_audit(
            action="RESET_PASSWORD",
            entity_type="USER",
            entity_id=user.user_id,
            details={"username": user.username},
            request=request,
        )
        return Response({"message": f"Password reset successfully for {user.username}."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unlock")
    def unlock(self, request, pk=None):
        user = self.get_object()
        user.failed_attempts = 0
        user.locked_until = None
        user.save(update_fields=["failed_attempts", "locked_until"])

        log_audit(
            action="UNLOCK",
            entity_type="USER",
            entity_id=user.user_id,
            details={"username": user.username},
            request=request,
        )
        return Response({"message": f"User {user.username} unlocked."}, status=status.HTTP_200_OK)


class StaffViewSet(viewsets.ModelViewSet):
    """Staff directory and management."""
    serializer_class = StaffSerializer
    pagination_class = StandardPagination
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action == "list":
            return [IsRole("ADMIN", "RECEPTIONIST")()]
        if self.action in ["retrieve", "doctors"]:
            return [IsRole("ADMIN", "RECEPTIONIST", "DOCTOR", "PHARMACIST", "LAB_TECH")()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = Staff.objects.select_related("department", "role").prefetch_related("doctor_profile").all().order_by("name")

        role_filter = self.request.query_params.get("role")
        if role_filter:
            qs = qs.filter(role__role_id=role_filter)

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ["true", "1"])

        dept = self.request.query_params.get("department")
        if dept:
            qs = qs.filter(department_id=dept)

        search = self.request.query_params.get("search")
        if search:
            q = search.strip()
            qs = qs.filter(Q(name__icontains=q) | Q(email__icontains=q) | Q(phone__icontains=q))

        return qs

    @action(detail=False, methods=["get"], url_path="doctors")
    def doctors(self, request):
        """Active doctors list for booking dropdowns."""
        docs = Staff.objects.select_related("department", "role").prefetch_related("doctor_profile").filter(
            role__role_id="DOCTOR", is_active=True
        ).order_by("name")
        return Response(StaffSerializer(docs, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="deactivate")
    @transaction.atomic
    def deactivate(self, request, pk=None):
        """Deactivates staff and corresponding user account."""
        staff = self.get_object()

        # If doctor, check future appointments
        from cms_recepapp.models import Appointment
        future_count = Appointment.objects.filter(
            doctor__staff=staff,
            appointment_date__gte=datetime.date.today(),
            status__in=["SCHEDULED", "CHECKED_IN"],
        ).count()

        if future_count > 0:
            return Response(
                {"detail": f"Cannot deactivate staff member. Dr. {staff.name} has {future_count} upcoming appointment(s).", "code": "HAS_FUTURE_APPOINTMENTS"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff.is_active = False
        staff.save(update_fields=["is_active"])

        # Also deactivate user account
        user = User.objects.filter(staff=staff).first()
        if user:
            user.is_active = False
            user.save(update_fields=["is_active"])

        log_audit(
            action="DEACTIVATE_STAFF",
            entity_type="STAFF",
            entity_id=staff.staff_id,
            details={"staffName": staff.name, "role": staff.role.role_id if staff.role else None},
            request=request,
        )

        return Response(StaffSerializer(staff).data, status=status.HTTP_200_OK)


class DepartmentViewSet(viewsets.ModelViewSet):
    """Department master data."""
    serializer_class = DepartmentSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsRole("ADMIN", "RECEPTIONIST", "DOCTOR", "PHARMACIST", "LAB_TECH")()]
        return [IsAdmin()]

    def get_queryset(self):
        qs = Department.objects.select_related("head_doctor").all().order_by("name")
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ["true", "1"])
        return qs


class SettingViewSet(viewsets.ModelViewSet):
    """System settings management."""
    serializer_class = SettingSerializer
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_queryset(self):
        return Setting.objects.all().order_by("key")

    def list(self, request, *args, **kwargs):
        settings_qs = self.get_queryset()
        data = {s.key: s.value for s in settings_qs}
        return Response(data, status=status.HTTP_200_OK)

    def patch(self, request, *args, **kwargs):
        data = request.data
        updated = {}
        for k, v in data.items():
            import json
            # Setting consumers parse these values with json.loads(); keep
            # strings encoded just like numeric and structured values.
            val_str = json.dumps(v)
            s, _ = Setting.objects.update_or_create(key=k, defaults={"value": val_str})
            updated[k] = v
        return Response(updated, status=status.HTTP_200_OK)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Audit log records (ADMIN only)."""
    serializer_class = AuditLogSerializer
    pagination_class = StandardPagination
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("user").all().order_by("-created_at")
        search = self.request.query_params.get("search", "").strip()
        action = self.request.query_params.get("action", "").strip()
        resource_type = self.request.query_params.get("resource_type", "").strip()

        if len(search) > 100:
            raise ValidationError({"search": "Search must be 100 characters or fewer."})
        if len(action) > 50:
            raise ValidationError({"action": "Action must be 50 characters or fewer."})
        if len(resource_type) > 50:
            raise ValidationError({"resource_type": "Resource type must be 50 characters or fewer."})
        if action:
            qs = qs.filter(action__iexact=action)
        if resource_type:
            qs = qs.filter(entity_type__iexact=resource_type)
        if search:
            qs = qs.filter(
                Q(action__icontains=search)
                | Q(entity_type__icontains=search)
                | Q(entity_id__icontains=search)
                | Q(user__username__icontains=search)
            )
        return qs


class NotificationViewSet(viewsets.ModelViewSet):
    """User notifications queue."""
    serializer_class = NotificationSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        user = self.request.user
        role_name = getattr(user.role, "role_id", str(user.role)) if user and user.role else ""
        return Notification.objects.filter(
            Q(target_user=user) | Q(target_role=role_name)
        ).order_by("-created_at")

    @action(detail=True, methods=["patch"], url_path="read")
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notif).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        user = self.request.user
        role_name = getattr(user.role, "role_id", str(user.role)) if user and user.role else ""
        Notification.objects.filter(
            Q(target_user=user) | Q(target_role=role_name),
            is_read=False
        ).update(is_read=True)
        return Response({"message": "All notifications marked as read."}, status=status.HTTP_200_OK)


class DashboardViewSet(viewsets.ViewSet):
    """Role-specific KPI dashboards."""

    @action(detail=False, methods=["get"], url_path="admin", permission_classes=[IsAdmin()])
    def admin_dashboard(self, request):
        from cms_recepapp.models import Appointment, Bill
        from cms_doctorapp.models import LabTest
        from cms_pharmapp.models import Medicine

        today = datetime.date.today()
        staff_count = Staff.objects.filter(is_active=True).count()
        active_doctors = Staff.objects.filter(role__role_id="DOCTOR", is_active=True).count()
        today_appts = Appointment.objects.filter(appointment_date=today).count()
        pending_labs = LabTest.objects.filter(status__in=["ORDERED", "SAMPLE_COLLECTED", "PROCESSING"]).count()
        low_stock = Medicine.objects.filter(is_active=True, stock_quantity__lte=10).count()
        revenue = Bill.objects.aggregate(total=Sum("amount_paid"))["total"] or Decimal("0.00")

        return Response({
            "staffCount": staff_count,
            "activeDoctors": active_doctors,
            "todayAppointments": today_appts,
            "pendingLabs": pending_labs,
            "lowStockMedicines": low_stock,
            "totalRevenuePaise": int(round(float(revenue) * 100)),
        }, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=["get"],
        url_path="doctor",
        permission_classes=[IsRole("DOCTOR")],
    )
    def doctor_dashboard(self, request):
        from cms_recepapp.models import Appointment, Patient
        from cms_doctorapp.models import Doctor, LabTest, Prescription
        from cms_doctorapp.serializers import LabOrderSerializer

        today = datetime.date.today()
        staff = getattr(request.user, "staff", None)
        doctor = Doctor.objects.filter(staff=staff).first() if staff else None
        if doctor is None:
            return Response(
                {"detail": "This account is not linked to a doctor profile."},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs_appts = Appointment.objects.filter(doctor=doctor, appointment_date=today)
        qs_labs = LabTest.objects.filter(
            doctor=doctor,
        ).exclude(status__in=["COMPLETED", "CANCELLED"]).select_related(
            "patient", "doctor__staff", "test_catalog"
        ).order_by(
            "-ordered_date", "-created_at"
        )
        qs_rx = Prescription.objects.filter(doctor=doctor, status="PENDING")
        qs_patients = Patient.objects.filter(
            Q(assigned_doctor=doctor) | Q(appointments__doctor=doctor)
        ).distinct()
        pending_statuses = ["SCHEDULED", "CHECKED_IN"]

        return Response({
            "todayAppointments": qs_appts.count(),
            "patients": qs_patients.count(),
            "pendingAppointments": qs_appts.filter(status__in=pending_statuses).count(),
            "completedConsultations": qs_appts.filter(status="COMPLETED").count(),
            "pendingLabs": qs_labs.count(),
            "pendingLabsList": LabOrderSerializer(qs_labs[:5], many=True).data,
            "activePrescriptions": qs_rx.count(),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="reception")
    def reception_dashboard(self, request):
        from cms_recepapp.models import Appointment
        from cms_recepapp.services import mark_expired_scheduled_appointments

        mark_expired_scheduled_appointments(request=request)
        today = timezone.localdate()
        today_appts = Appointment.objects.filter(appointment_date=today)

        return Response({
            "scheduled": today_appts.filter(status="SCHEDULED").count(),
            "checkedIn": today_appts.filter(status="CHECKED_IN").count(),
            "completed": today_appts.filter(status="COMPLETED").count(),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="pharmacy")
    def pharmacy_dashboard(self, request):
        from cms_doctorapp.models import Prescription
        from cms_pharmapp.models import Medicine

        pending_rx = Prescription.objects.filter(status="PENDING").count()
        low_stock = Medicine.objects.filter(is_active=True, stock_quantity__lte=10).count()
        out_of_stock = Medicine.objects.filter(is_active=True, stock_quantity__lte=0).count()

        return Response({
            "pendingPrescriptions": pending_rx,
            "lowStockMedicines": low_stock,
            "outOfStockMedicines": out_of_stock,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="lab", permission_classes=[IsRole("ADMIN", "LAB_TECH")()])
    def lab_dashboard(self, request):
        from cms_doctorapp.models import LabTest

        today = datetime.date.today()
        orders = LabTest.objects.all()

        return Response({
            "pending": orders.filter(status="ORDERED").count(),
            "sampleCollected": orders.filter(status="SAMPLE_COLLECTED").count(),
            "processing": orders.filter(status__in=["PROCESSING", "IN_PROGRESS"]).count(),
            "completedToday": orders.filter(status="COMPLETED", completed_at__date=today).count(),
        }, status=status.HTTP_200_OK)


class ReportViewSet(viewsets.ViewSet):
    """Analytical reports generator."""
    permission_classes = [IsAdmin]

    @action(detail=False, methods=["get"], url_path="generate")
    def generate(self, request):
        report_type = request.query_params.get("type", "appointments")
        start = request.query_params.get("start")
        end = request.query_params.get("end")

        if report_type not in {"appointments", "revenue", "medicines"}:
            return Response(
                {"detail": "Unsupported report type. Choose appointments, revenue, or medicines."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            start_date = parse_date(start) if start else None
            end_date = parse_date(end) if end else None
        except ValueError:
            start_date = end_date = None
        if (start and start_date is None) or (end and end_date is None):
            return Response({"detail": "Dates must use YYYY-MM-DD format."}, status=status.HTTP_400_BAD_REQUEST)
        if start_date and end_date and start_date > end_date:
            return Response({"detail": "Start date must be on or before end date."}, status=status.HTTP_400_BAD_REQUEST)

        from cms_recepapp.models import Appointment, Bill
        from cms_pharmapp.models import Medicine

        if report_type == "revenue":
            bills = Bill.objects.all()
            if start:
                bills = bills.filter(bill_date__gte=start)
            if end:
                bills = bills.filter(bill_date__lte=end)
            data = [
                {
                    "billId": b.bill_id,
                    "date": str(b.bill_date),
                    "patientName": b.patient.name,
                    "totalPaise": int(round(float(b.total_amount) * 100)),
                    "paidPaise": int(round(float(b.amount_paid) * 100)),
                    "status": b.payment_status,
                }
                for b in bills[:100]
            ]
        elif report_type == "medicines":
            meds = Medicine.objects.all()
            data = [
                {
                    "name": m.name,
                    "stockQuantity": m.stock_quantity,
                    "unitPricePaise": int(round(float(m.selling_price) * 100)),
                    "category": m.category,
                }
                for m in meds[:100]
            ]
        else:  # appointments
            appts = Appointment.objects.select_related("patient", "doctor__staff").all()
            if start:
                appts = appts.filter(appointment_date__gte=start)
            if end:
                appts = appts.filter(appointment_date__lte=end)
            data = [
                {
                    "appointmentId": a.appointment_id,
                    "patientName": a.patient.name,
                    "doctorName": a.doctor.staff.name,
                    "date": str(a.appointment_date),
                    "time": a.time_slot,
                    "status": a.status,
                }
                for a in appts[:100]
            ]

        return Response({"type": report_type, "count": len(data), "data": data}, status=status.HTTP_200_OK)
