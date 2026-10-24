"""Authenticated, administrator-only API views for clinic administration."""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils.dateparse import parse_date
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from cms_backendapp.models import AuditLog, Department, LabTestCatalog, Role, Setting, Staff, User
from cms_doctorapp.models import Doctor, LabTest
from cms_pharmapp.models import Medicine, Supplier
from cms_recepapp.models import Appointment, Bill, Patient

from .serializers import (
    AdminAuditLogSerializer,
    AdminDepartmentSerializer,
    AdminLabCatalogSerializer,
    AdminSettingSerializer,
    AdminStaffSerializer,
    AdminSupplierSerializer,
    AdminUserSerializer,
    ensure_supported_roles,
)


class IsAdmin(BasePermission):
    """Require a valid authenticated account whose stored role is ADMIN."""

    message = "Administrator access is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and getattr(getattr(user, "role", None), "role_id", None) == "ADMIN"
        )


class AdminPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


def search_term(request):
    term = request.query_params.get("search", "").strip()
    if len(term) > 100:
        raise ValidationError({"search": "Search must be 100 characters or fewer."})
    return term


def write_audit(request, action_name, entity_type, entity_id, details=None):
    AuditLog.objects.create(
        user=request.user,
        action=action_name,
        entity_type=entity_type,
        entity_id=str(entity_id),
        details=details or {},
        ip_address=request.META.get("REMOTE_ADDR"),
    )


class AdminModelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdmin]
    pagination_class = AdminPagination
    search_fields = ()

    def filter_search(self, queryset, fields):
        term = search_term(self.request)
        if term:
            query = Q()
            for field in fields:
                query |= Q(**{f"{field}__icontains": term})
            queryset = queryset.filter(query).distinct()
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        record = serializer.save()
        write_audit(self.request, "CREATE", record._meta.model_name.upper(), record.pk)

    @transaction.atomic
    def perform_update(self, serializer):
        record = serializer.save()
        write_audit(self.request, "UPDATE", record._meta.model_name.upper(), record.pk)


class AdminRoleViewSet(viewsets.ViewSet):
    """List the canonical role rows used by staff and user forms."""

    permission_classes = [IsAdmin]
    pagination_class = None
    def list(self, request, *args, **kwargs):
        roles = ensure_supported_roles()
        return Response([{"id": role.role_id, "code": role.role_id, "name": role.role_name} for role in roles])


class AdminStaffViewSet(AdminModelViewSet):
    serializer_class = AdminStaffSerializer

    def get_queryset(self):
        ensure_supported_roles()
        queryset = Staff.objects.select_related("role", "department").all().order_by("name", "staff_id")
        term = search_term(self.request)
        if term:
            queryset = queryset.filter(
                Q(name__icontains=term)
                | Q(email__icontains=term)
                | Q(phone__icontains=term)
                | Q(staff_id__icontains=term)
                | Q(role__role_id__icontains=term)
                | Q(role__role_name__icontains=term)
                | Q(department__name__icontains=term)
            ).distinct()
        role = self.request.query_params.get("role", "").strip()
        department = self.request.query_params.get("department", "").strip()
        active = self.request.query_params.get("is_active", "").strip().lower()
        if role:
            queryset = queryset.filter(role__role_id__iexact=role)
        if department:
            queryset = queryset.filter(department_id=department)
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        return queryset

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        staff = self.get_object()
        doctor = Doctor.objects.filter(staff=staff).first()
        if doctor and Appointment.objects.filter(
            doctor=doctor,
            appointment_date__gte=date.today(),
            status__in=["SCHEDULED", "CHECKED_IN"],
        ).exists():
            raise ValidationError({"detail": "This doctor has future scheduled or checked-in appointments and cannot be deactivated yet."})
        staff.is_active = False
        staff.save(update_fields=["is_active", "updated_at"])
        User.objects.filter(staff=staff).update(is_active=False)
        write_audit(request, "DEACTIVATE", "STAFF", staff.pk)
        return Response(self.get_serializer(staff).data, status=status.HTTP_200_OK)


class AdminUserViewSet(AdminModelViewSet):
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        ensure_supported_roles()
        queryset = User.objects.select_related("role", "staff", "staff__department").all().order_by("username", "user_id")
        term = search_term(self.request)
        if term:
            queryset = queryset.filter(
                Q(username__icontains=term)
                | Q(user_id__icontains=term)
                | Q(staff__name__icontains=term)
                | Q(staff__staff_id__icontains=term)
                | Q(staff__email__icontains=term)
                | Q(role__role_id__icontains=term)
                | Q(role__role_name__icontains=term)
            ).distinct()
        role = self.request.query_params.get("role", "").strip()
        active = self.request.query_params.get("is_active", "").strip().lower()
        if role:
            queryset = queryset.filter(role__role_id__iexact=role)
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        return queryset

    @action(detail=True, methods=["post"], url_path="unlock")
    def unlock(self, request, pk=None):
        user = self.get_object()
        user.failed_attempts = 0
        user.locked_until = None
        user.save(update_fields=["failed_attempts", "locked_until", "updated_at"])
        write_audit(request, "UNLOCK", "USER", user.pk)
        return Response(self.get_serializer(user).data)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        password = request.data.get("password")
        confirmation = request.data.get("confirmPassword")
        if not password:
            raise ValidationError({"password": "This field is required."})
        if password != confirmation:
            raise ValidationError({"confirmPassword": "Passwords do not match."})
        from django.contrib.auth import get_user_model
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            validate_password(password, user=get_user_model()(username=user.username, email=user.staff.email or ""))
        except DjangoValidationError as exc:
            raise ValidationError({"password": exc.messages}) from exc
        user.set_password(password)
        user.failed_attempts = 0
        user.locked_until = None
        user.save(update_fields=["password_hash", "failed_attempts", "locked_until", "updated_at"])
        write_audit(request, "RESET_PASSWORD", "USER", user.pk)
        return Response({"detail": "Password reset successfully."}, status=status.HTTP_200_OK)


class AdminGlobalSearchView(APIView):
    """Search safe user-account and staff directory fields for the admin header."""

    permission_classes = [IsAdmin]
    max_query_length = 100
    result_limit = 10

    def get(self, request):
        term = request.query_params.get("q", "").strip()
        if len(term) > self.max_query_length:
            raise ValidationError({"q": "Search must be 100 characters or fewer."})
        if not term:
            return Response({"results": []})

        users = list(User.objects.select_related("role", "staff").filter(
            Q(username__icontains=term)
            | Q(staff__name__icontains=term)
            | Q(staff__email__icontains=term)
            | Q(staff__phone__icontains=term)
            | Q(staff__designation__icontains=term)
            | Q(role__role_id__icontains=term)
            | Q(role__role_name__icontains=term)
        ).order_by("username", "user_id")[: self.result_limit])

        linked_staff_ids = [user.staff_id for user in users if user.staff_id]
        staff_members = Staff.objects.select_related("role", "department").filter(
            Q(name__icontains=term)
            | Q(email__icontains=term)
            | Q(phone__icontains=term)
            | Q(designation__icontains=term)
            | Q(role__role_id__icontains=term)
            | Q(role__role_name__icontains=term)
            | Q(department__name__icontains=term)
        ).distinct().order_by("name", "staff_id")
        if linked_staff_ids:
            staff_members = staff_members.exclude(pk__in=linked_staff_ids)
        staff_members = staff_members[: self.result_limit]

        results = []
        for user in users:
            staff = user.staff
            results.append({
                "id": str(user.pk),
                "name": (staff.name if staff else "") or user.username,
                "username": user.username,
                "email": staff.email if staff else None,
                "phone": staff.phone if staff else None,
                "role": user.role.role_name if user.role else None,
                "designation": staff.designation if staff else None,
                "category": "user",
            })
        for staff in staff_members:
            results.append({
                "id": str(staff.pk),
                "name": staff.name,
                "username": None,
                "email": staff.email,
                "role": staff.role.role_name if staff.role else None,
                "designation": staff.designation,
                "category": "staff",
            })
        return Response({"results": results})


class AdminDepartmentViewSet(AdminModelViewSet):
    serializer_class = AdminDepartmentSerializer

    def get_queryset(self):
        queryset = Department.objects.select_related("head_doctor").all().order_by("name", "department_id")
        term = search_term(self.request)
        if term:
            queryset = queryset.filter(
                Q(name__icontains=term) | Q(code__icontains=term)
                | Q(head_doctor__name__icontains=term) | Q(department_id__icontains=term)
            ).distinct()
        active = self.request.query_params.get("is_active", "").strip().lower()
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        return queryset


class AdminLabCatalogViewSet(AdminModelViewSet):
    serializer_class = AdminLabCatalogSerializer

    def get_queryset(self):
        queryset = LabTestCatalog.objects.select_related("department").all().order_by("test_name", "test_catalog_id")
        term = search_term(self.request)
        if term:
            queryset = queryset.filter(
                Q(test_name__icontains=term) | Q(code__icontains=term)
                | Q(category__icontains=term) | Q(sample_type__icontains=term)
                | Q(test_catalog_id__icontains=term)
            ).distinct()
        category = self.request.query_params.get("category", "").strip()
        active = self.request.query_params.get("is_active", "").strip().lower()
        if category:
            queryset = queryset.filter(category__iexact=category)
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        return queryset


class AdminSupplierViewSet(AdminModelViewSet):
    serializer_class = AdminSupplierSerializer

    def get_queryset(self):
        queryset = Supplier.objects.all().order_by("name", "supplier_id")
        term = search_term(self.request)
        if term:
            queryset = queryset.filter(
                Q(name__icontains=term) | Q(contact_person__icontains=term)
                | Q(email__icontains=term) | Q(phone__icontains=term)
                | Q(supplier_id__icontains=term)
            ).distinct()
        active = self.request.query_params.get("is_active", "").strip().lower()
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        return queryset

    @action(detail=True, methods=["get"], url_path="rates")
    def rates(self, request, pk=None):
        supplier = self.get_object()
        medicines = supplier.typical_medicines or []
        return Response({"typicalMedicines": medicines})


class AdminDashboardViewSet(viewsets.ViewSet):
    permission_classes = [IsAdmin]

    def list(self, request):
        revenue = Bill.objects.aggregate(total=Sum("amount_paid"))["total"] or Decimal("0.00")
        return Response({
            "staffCount": Staff.objects.filter(is_active=True).count(),
            "activeDoctors": Staff.objects.filter(role__role_id="DOCTOR", is_active=True).count(),
            "todayAppointments": Appointment.objects.filter(appointment_date=date.today()).count(),
            "pendingLabs": LabTest.objects.filter(status__in=["ORDERED", "SAMPLE_COLLECTED", "PROCESSING"]).count(),
            "lowStockMedicines": Medicine.objects.filter(is_active=True, stock_quantity__lte=10).count(),
            "totalRevenuePaise": int(revenue * 100),
        })


class AdminReportsViewSet(viewsets.ViewSet):
    permission_classes = [IsAdmin]

    def list(self, request):
        report_type = request.query_params.get("type", "appointments")
        if report_type not in {"appointments", "revenue", "medicines"}:
            raise ValidationError({"type": "Choose appointments, revenue, or medicines."})
        start_raw = request.query_params.get("start")
        end_raw = request.query_params.get("end")
        start = parse_date(start_raw) if start_raw else None
        end = parse_date(end_raw) if end_raw else None
        if (start_raw and not start) or (end_raw and not end):
            raise ValidationError({"date": "Dates must use YYYY-MM-DD format."})
        if start and end and start > end:
            raise ValidationError({"date": "Start date must be on or before end date."})

        if report_type == "revenue":
            rows = Bill.objects.select_related("patient").all().order_by("-bill_date", "bill_id")
            if start:
                rows = rows.filter(bill_date__gte=start)
            if end:
                rows = rows.filter(bill_date__lte=end)
            data = [{
                "billId": item.bill_id, "date": str(item.bill_date), "patientName": item.patient.name,
                "totalPaise": int(item.total_amount * 100), "paidPaise": int(item.amount_paid * 100),
                "status": item.payment_status,
            } for item in rows[:100]]
        elif report_type == "medicines":
            data = [{
                "name": item.name, "stockQuantity": item.stock_quantity,
                "unitPricePaise": int(item.selling_price * 100), "category": item.category,
            } for item in Medicine.objects.all().order_by("name")[:100]]
        else:
            rows = Appointment.objects.select_related("patient", "doctor__staff").all().order_by("-appointment_date", "-time_slot")
            if start:
                rows = rows.filter(appointment_date__gte=start)
            if end:
                rows = rows.filter(appointment_date__lte=end)
            data = [{
                "appointmentId": item.appointment_id, "date": str(item.appointment_date),
                "time": str(item.start_time), "patientName": item.patient.name,
                "doctorName": item.doctor.staff.name, "status": item.status,
            } for item in rows[:100]]
        return Response({"type": report_type, "count": len(data), "data": data})


class AdminSettingView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return Response({item.key: item.value for item in Setting.objects.all().order_by("key")})

    def post(self, request):
        return self._save(request)

    def patch(self, request):
        return self._save(request)

    def _save(self, request):
        if not isinstance(request.data, dict):
            raise ValidationError({"detail": "Settings must be sent as a JSON object."})
        invalid_keys = [key for key in request.data if not isinstance(key, str) or not key.strip() or len(key.strip()) > 100]
        if invalid_keys:
            raise ValidationError({"key": "Setting keys must contain 1–100 characters."})
        import json
        updated = {}
        with transaction.atomic():
            for key, value in request.data.items():
                key = key.strip()
                item, _ = Setting.objects.update_or_create(key=key, defaults={"value": json.dumps(value)})
                updated[item.key] = value
                write_audit(request, "UPDATE", "SETTING", item.pk, {"key": item.key})
        return Response(updated, status=status.HTTP_200_OK)


class AdminAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AdminAuditLogSerializer
    permission_classes = [IsAdmin]
    pagination_class = AdminPagination

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("user").all().order_by("-created_at", "log_id")
        term = search_term(self.request)
        if term:
            queryset = queryset.filter(
                Q(action__icontains=term) | Q(entity_type__icontains=term)
                | Q(entity_id__icontains=term) | Q(user__username__icontains=term)
            ).distinct()
        action_name = self.request.query_params.get("action", "").strip()
        resource_type = self.request.query_params.get("resource_type", "").strip()
        if action_name:
            queryset = queryset.filter(action__iexact=action_name)
        if resource_type:
            queryset = queryset.filter(entity_type__iexact=resource_type)
        return queryset
