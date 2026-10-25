"""
cms_recepapp/views.py
ViewSets for Receptionist domain models:
- PatientViewSet
- AppointmentViewSet
- BillViewSet
- PaymentViewSet
"""

import datetime
from decimal import Decimal
from functools import wraps
from django.db import transaction, IntegrityError, OperationalError
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import viewsets, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from cms_backendapp.permissions import IsRole
from cms_backendapp.models import Staff, Department, Notification
from cms_backendapp.audit import log_audit
from cms_doctorapp.models import Doctor, ConsultationRecord, Prescription, LabTest
from .models import Patient, Appointment, Bill, BillItem, Payment
from .serializers import (
    PatientSerializer,
    AppointmentSerializer,
    BillSerializer,
    BillItemSerializer,
    PaymentSerializer,
)
from .services import (
    resolve_doctor,
    get_slot_board,
    get_next_walkin_slot,
    get_consultation_fee,
    get_registration_fee,
    get_slot_config,
    DEFAULT_CONSULTATION_FEE_PAISE,
    mark_expired_scheduled_appointments,
)


def booking_database_errors(func):
    @wraps(func)
    def wrapped(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except IntegrityError:
            return Response({"detail": "The booking conflicted with another request. Refresh availability and try again.", "code": "BOOKING_CONFLICT"}, status=status.HTTP_409_CONFLICT)
        except OperationalError:
            return Response({"detail": "The booking could not be saved. Refresh availability and retry.", "code": "BOOKING_RETRY_REQUIRED"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return wrapped


class ReceptionPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


class PatientViewSet(viewsets.ModelViewSet):
    """
    CRUD + Search for Patients.
    - RECEPTIONIST, DOCTOR, ADMIN can view.
    - RECEPTIONIST, ADMIN can create/update/delete.
    """
    serializer_class = PatientSerializer
    pagination_class = ReceptionPagination

    def get_permissions(self):
        if self.action in ["list", "retrieve", "precheck", "clinical_history"]:
            return [IsRole("ADMIN", "DOCTOR", "RECEPTIONIST")()]
        return [IsRole("ADMIN", "RECEPTIONIST")()]

    def get_queryset(self):
        qs = Patient.objects.select_related("assigned_doctor__staff").all().order_by("-created_at")

        # Active filter
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ["true", "1"])

        # Search by name, MRN, phone
        search = self.request.query_params.get("search")
        if search:
            q = search.strip()
            qs = qs.filter(
                Q(patient_id__icontains=q) |
                Q(name__icontains=q) |
                Q(mrn__icontains=q) |
                Q(phone__icontains=q)
            )

        gender_param = self.request.query_params.get("gender")
        if gender_param:
            gender_map = {"male": ["M", "Male"], "female": ["F", "Female"], "other": ["Other"]}
            qs = qs.filter(gender__in=gender_map.get(gender_param.strip().lower(), [gender_param]))

        registration_filter = self.request.query_params.get("registration", "all").lower()
        today = timezone.localdate()
        day_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time.min))
        day_end = day_start + datetime.timedelta(days=1)
        if registration_filter == "today":
            qs = qs.filter(
                Q(registered_on=today) |
                (Q(registered_on__isnull=True) & Q(created_at__gte=day_start, created_at__lt=day_end))
            )
        elif registration_filter == "previous":
            qs = qs.filter(
                Q(registered_on__lt=today) |
                (Q(registered_on__isnull=True) & Q(created_at__lt=day_start))
            )

        # Doctor scope: if doctor or ?doctor_scope=mine
        doctor_scope = self.request.query_params.get("doctor_scope")
        user_role = getattr(self.request.user.role, "role_id", str(self.request.user.role)) if self.request.user else ""
        if user_role == "DOCTOR" or doctor_scope == "mine" or self.request.query_params.get("scope") == "mine":
            staff = getattr(self.request.user, "staff", None)
            doc = Doctor.objects.filter(staff=staff).first() if staff else None
            if not doc:
                return qs.none()
            qs = qs.filter(
                Q(assigned_doctor=doc) |
                Q(appointments__doctor=doc)
            ).distinct()

        return qs

    def potential_duplicate_matches(self, patient_data):
        name = str(patient_data.get("name", "")).strip()
        phone = str(patient_data.get("phone", "")).strip()
        dob = patient_data.get("dateOfBirth") or patient_data.get("dob")
        match_query = Q(name__iexact=name, dob=dob) if name and dob else Q(pk__in=[])
        if phone:
            match_query |= Q(phone=phone)
        matches = Patient.objects.filter(is_active=True).filter(match_query).order_by("-created_at")[:5]
        return [{
            "id": patient.patient_id,
            "mrn": patient.mrn,
            "name": patient.name,
            "phone": patient.phone,
            "dateOfBirth": patient.dob.isoformat() if patient.dob else None,
        } for patient in matches]

    @action(detail=False, methods=["post"], url_path="precheck")
    def precheck(self, request):
        """Validates patient registration details before saving the record."""
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "valid": True,
            "message": "Precheck passed.",
            "potentialDuplicates": self.potential_duplicate_matches(request.data),
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        # Validate dates and types before they are used in duplicate queries.
        self.get_serializer(data=request.data).is_valid(raise_exception=True)
        candidates = self.potential_duplicate_matches(request.data)
        if candidates and request.data.get("confirmPossibleDuplicate") is not True:
            return Response({
                "detail": "Possible matching patient records were found. Confirm that this is a new or different patient to continue.",
                "code": "POSSIBLE_DUPLICATE",
                "potentialDuplicates": candidates,
            }, status=status.HTTP_409_CONFLICT)
        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="register-and-pay")
    @transaction.atomic
    def register_and_pay(self, request):
        """
        Legacy endpoint retained for older clients. Registration saves the patient only;
        the one-time registration fee is collected with the first appointment bill.
        """
        patient_data = request.data.get("patient") or request.data
        serializer = self.get_serializer(data=patient_data)
        serializer.is_valid(raise_exception=True)
        candidates = self.potential_duplicate_matches(patient_data)
        if candidates and request.data.get("confirmPossibleDuplicate") is not True:
            return Response({
                "detail": "Possible matching patient records were found. Confirm that this is a new or different patient to continue.",
                "code": "POSSIBLE_DUPLICATE",
                "potentialDuplicates": candidates,
            }, status=status.HTTP_409_CONFLICT)

        patient = serializer.save()
        return Response({"patient": PatientSerializer(patient).data}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="clinical-history")
    def clinical_history(self, request, pk=None):
        """Retrieves consultations, prescriptions, and lab orders for a patient."""
        patient = self.get_object()
        # Access to the patient is doctor-scoped in get_queryset above. Once authorized,
        # the longitudinal history intentionally includes records from all clinicians.
        consultations = list(ConsultationRecord.objects.filter(patient=patient).order_by("-visit_date").values(
            "record_id", "visit_date", "diagnosis", "symptoms", "notes", "doctor__staff__name"
        ))

        prescriptions = list(Prescription.objects.filter(patient=patient).order_by("-created_at").values(
            "prescription_id", "status", "created_at", "doctor__staff__name"
        ))

        lab_orders = list(LabTest.objects.filter(patient=patient).order_by("-ordered_date").values(
            "test_id", "test_catalog__test_name", "status", "ordered_date", "priority"
        ))

        return Response({
            "patientId": patient.patient_id,
            "patientName": patient.name,
            "consultations": consultations,
            "prescriptions": prescriptions,
            "labOrders": lab_orders,
        }, status=status.HTTP_200_OK)


class AppointmentViewSet(viewsets.ModelViewSet):
    """
    CRUD + filters for Appointments.
    - RECEPTIONIST, DOCTOR, ADMIN can view.
    - RECEPTIONIST, DOCTOR, ADMIN can create/update/cancel.
    """
    serializer_class = AppointmentSerializer
    pagination_class = ReceptionPagination

    def get_permissions(self):
        if self.action in ["print_token", "undo_no_show"]:
            return [IsRole("ADMIN", "RECEPTIONIST")()]
        return [IsRole("ADMIN", "DOCTOR", "RECEPTIONIST")()]

    def registration_fee_due(self, patient):
        """Charge registration only until a positive registration payment exists or a paid visit is completed."""
        registration_paid = Bill.objects.filter(
            patient=patient,
            items__item_type=BillItem.ItemType.REGISTRATION,
            payments__amount_paid__gt=0,
        ).exists()
        if registration_paid:
            return False

        completed_visit = Appointment.objects.filter(
            patient=patient,
            status=Appointment.Status.COMPLETED,
        ).exists() or ConsultationRecord.objects.filter(
            patient=patient,
            is_completed=True,
        ).exists()
        paid_consultation_history = Bill.objects.filter(
            patient=patient,
            payment_status=Bill.PaymentStatus.PAID,
            payments__isnull=False,
            items__item_type=BillItem.ItemType.CONSULTATION,
        ).exists()
        completed_paid_consultation = completed_visit and paid_consultation_history
        return not completed_paid_consultation

    @action(detail=False, methods=["get"], url_path="booking-quote")
    def booking_quote(self, request):
        patient_id = request.query_params.get("patient") or request.query_params.get("patientId")
        doctor_id = request.query_params.get("doctor") or request.query_params.get("doctorId")
        patient = Patient.objects.filter(pk=patient_id, is_active=True).first() if patient_id else None
        doctor = resolve_doctor(doctor_id) if doctor_id else None
        if not patient or not doctor or not doctor.staff.is_active:
            return Response({"detail": "Select an active patient and doctor.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        consultation = get_consultation_fee(doctor_id)
        registration = get_registration_fee() if self.registration_fee_due(patient) else 0
        return Response({
            "patientId": patient.patient_id,
            "doctorId": doctor.staff.staff_id,
            "registrationFee": registration,
            "consultationFee": consultation,
            "total": registration + consultation,
            "registrationFeeDue": registration > 0,
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        return Response(
            {"detail": "Appointments must be created through book-and-pay so payment and token issuance remain atomic.", "code": "PAYMENT_REQUIRED"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def update(self, request, *args, **kwargs):
        if set(request.data) - {"reason", "notes", "type"}:
            return Response({"detail": "Use the appointment workflow actions to change a booking.", "code": "INVALID_STATE"}, status=status.HTTP_400_BAD_REQUEST)
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response({"detail": "Appointment history cannot be deleted. Use cancellation.", "code": "INVALID_STATE"}, status=status.HTTP_400_BAD_REQUEST)

    def list(self, request, *args, **kwargs):
        mark_expired_scheduled_appointments(request=request)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = Appointment.objects.select_related(
            "patient", "doctor__staff", "doctor__department", "department", "created_by"
        ).prefetch_related("bills").all().order_by("appointment_date", "time_slot")

        # Filter: date
        date_param = self.request.query_params.get("date")
        if date_param:
            qs = qs.filter(appointment_date=date_param)
        if self.request.query_params.get("exclude_today") == "true":
            qs = qs.exclude(appointment_date=timezone.localdate())

        # Booking date is distinct from the date the appointment is scheduled.
        booked_date = self.request.query_params.get("booked_date")
        if booked_date:
            try:
                booking_day = datetime.date.fromisoformat(booked_date)
            except ValueError:
                raise serializers.ValidationError({"booked_date": "Enter a valid date (YYYY-MM-DD)."})
            start = timezone.make_aware(datetime.datetime.combine(booking_day, datetime.time.min))
            end = timezone.make_aware(datetime.datetime.combine(booking_day + datetime.timedelta(days=1), datetime.time.min))
            qs = qs.filter(created_at__gte=start, created_at__lt=end)

        # Filter: doctor
        doctor_param = self.request.query_params.get("doctor") or self.request.query_params.get("doctorId")
        user_role = getattr(self.request.user.role, "role_id", str(self.request.user.role)) if self.request.user else ""
        if user_role == "DOCTOR":
            staff = getattr(self.request.user, "staff", None)
            doctor = Doctor.objects.filter(staff=staff).first() if staff else None
            if not doctor:
                return qs.none()
            qs = qs.filter(doctor=doctor)
        elif doctor_param == "me" and hasattr(self.request.user, "staff"):
            qs = qs.filter(doctor__staff=self.request.user.staff)
        elif doctor_param:
            qs = qs.filter(Q(doctor__staff__staff_id=doctor_param) | Q(doctor__doctor_id=doctor_param))

        # Filter: patient
        patient_param = self.request.query_params.get("patient") or self.request.query_params.get("patientId")
        if patient_param:
            qs = qs.filter(patient__patient_id=patient_param)

        # Filter: status
        status_param = self.request.query_params.get("status")
        if status_param:
            statuses = [s.strip() for s in status_param.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

        # Search by patient name, database ID/MRN, or doctor name.
        search = self.request.query_params.get("search")
        if search:
            q = search.strip()
            search_filter = (
                Q(patient__name__icontains=q) |
                Q(patient__patient_id__icontains=q) |
                Q(patient__mrn__icontains=q) |
                Q(patient__phone__icontains=q) |
                Q(doctor__staff__name__icontains=q)
            )
            token = q.removeprefix("#")
            if token.isascii() and token.isdigit() and len(token) <= 9:
                search_filter |= Q(token_number=int(token))
            qs = qs.filter(search_filter)

        if search and not date_param and not booked_date:
            qs = qs.order_by("-appointment_date", "-time_slot", "-created_at")
        elif booked_date and not date_param:
            qs = qs.order_by("-created_at", "appointment_date", "time_slot")

        return qs

    @action(detail=False, methods=["get"], url_path="slot-board")
    def slot_board(self, request):
        """Returns slot states (free, booked, past) for doctor on date."""
        doc_ident = request.query_params.get("doctor") or request.query_params.get("doctorId")
        date_str = request.query_params.get("date") or timezone.localdate().isoformat()
        if not doc_ident:
            return Response({"detail": "Doctor is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        board = get_slot_board(doc_ident, date_str)
        return Response(board, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="doctor-availability")
    def doctor_availability(self, request):
        """Summarize slot availability for active doctors on a selected date."""
        date_str = request.query_params.get("date") or timezone.localdate().isoformat()
        doctors = Doctor.objects.filter(staff__is_active=True).select_related("staff", "department")
        results = []
        for doctor in doctors:
            slots = get_slot_board(doctor.staff.staff_id, date_str)
            free_slots = sum(1 for slot in slots if slot["state"] == "free")
            results.append({
                "doctorId": doctor.doctor_id,
                "staffId": doctor.staff.staff_id,
                "doctorName": doctor.staff.name,
                "department": doctor.department.name if doctor.department else None,
                "available": free_slots > 0,
                "status": "AVAILABLE" if free_slots else "UNAVAILABLE",
                "freeSlots": free_slots,
            })
        return Response(results, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="next-walkin-slot")
    def next_walkin_slot(self, request):
        """Returns next available walk-in slot for doctor today."""
        doc_ident = request.query_params.get("doctor") or request.query_params.get("doctorId")
        if not doc_ident:
            return Response({"detail": "Doctor is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        slot = get_next_walkin_slot(doc_ident)
        if not slot:
            return Response(
                {"detail": "No free slot is left today for this doctor.", "code": "NO_SLOT_AVAILABLE"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(slot, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="consultation-fee")
    def consultation_fee(self, request):
        """Returns consultation fee in integer paise for a doctor."""
        doc_ident = request.query_params.get("doctor") or request.query_params.get("doctorId")
        if not doc_ident:
            return Response({"detail": "Doctor is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        fee = get_consultation_fee(doc_ident)
        return Response({"doctorId": doc_ident, "fee": fee}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="book-and-pay")
    @booking_database_errors
    @transaction.atomic
    def book_and_pay(self, request):
        """
        Books appointment + creates PAID consultation bill + records payment in one transaction.
        """
        data = request.data
        patient_id = data.get("patientId")
        doc_ident = data.get("doctorId")
        payment_info = data.get("payment") or {}
        if not isinstance(payment_info, dict):
            return Response({"detail": "Invalid payment details.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        method = str(payment_info.get("method", "CASH")).upper()

        if payment_info.get("confirmed") is not True:
            return Response({"detail": "Payment must be explicitly confirmed before booking.", "code": "PAYMENT_NOT_CONFIRMED"}, status=status.HTTP_400_BAD_REQUEST)
        if method not in ["CASH", "CARD", "UPI"]:
            return Response({"detail": "Please select a valid payment method (CASH, CARD, UPI).", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        if not patient_id or not doc_ident:
            return Response({"detail": "Patient and doctor are required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        patient = Patient.objects.select_for_update().filter(pk=patient_id).first()
        if not patient or not patient.is_active:
            return Response({"detail": "Invalid or inactive patient.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        doctor = resolve_doctor(doc_ident)
        if not doctor or not doctor.staff.is_active:
            return Response({"detail": "Selected doctor is not available.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        # Serialize booking attempts for this doctor so concurrent requests cannot
        # both pass the slot check before either one writes its appointment.
        doctor = Doctor.objects.select_for_update().select_related("staff", "department").get(pk=doctor.pk)

        dept = doctor.department or doctor.staff.department
        if not doctor.staff.is_active or not dept or not dept.is_active or not dept.is_bookable:
            return Response({"detail": "The selected doctor or department is not available for booking.", "code": "DOCTOR_UNAVAILABLE"}, status=status.HTTP_400_BAD_REQUEST)
        department_id = data.get("departmentId")
        if department_id and department_id != dept.pk:
            return Response({"detail": "The doctor does not belong to the selected department.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        consultation_paise = get_consultation_fee(doc_ident)
        registration_paise = get_registration_fee() if self.registration_fee_due(patient) else 0
        total_paise = consultation_paise + registration_paise
        if data.get("expectedTotal") is not None:
            try:
                expected_total = int(data["expectedTotal"])
            except (TypeError, ValueError):
                return Response({"detail": "The quoted total is invalid.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            if expected_total != total_paise:
                return Response({"detail": "The bill changed since it was displayed. Review the updated fees before confirming payment.", "code": "QUOTE_CHANGED"}, status=status.HTTP_409_CONFLICT)

        mode = str(data.get("mode", "PRIOR")).upper()
        now = timezone.localtime()
        today = now.date()
        today_str = today.isoformat()

        if mode == "WALK_IN":
            requested_date = data.get("date")
            if requested_date and requested_date != today_str:
                return Response({"detail": "Walk-in appointments are only available for today.", "code": "INVALID_APPOINTMENT_DATE"}, status=status.HTTP_400_BAD_REQUEST)
            date_val = today_str
            same_doctor_day = Appointment.objects.select_for_update().filter(
                patient=patient, doctor=doctor, appointment_date=date_val,
            ).exclude(status=Appointment.Status.CANCELLED).exists()
            if same_doctor_day:
                return Response({
                    "detail": "This patient already has an appointment with this doctor on the selected date.",
                    "code": "DUPLICATE_DOCTOR_DAY",
                }, status=status.HTTP_409_CONFLICT)
            time_val = data.get("time")
            if not time_val:
                return Response({"detail": "Select an available walk-in slot for today.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            # Recompute the earliest slot while holding the doctor lock. Never
            # silently move a confirmed booking to a different time.
            slot_info = get_next_walkin_slot(doc_ident, now=now)
            if not slot_info:
                return Response({"detail": "No walk-in slots available for today. Please choose another available doctor.", "code": "SLOT_UNAVAILABLE"}, status=status.HTTP_400_BAD_REQUEST)
            if slot_info["time"] != time_val:
                return Response({"detail": "The next available walk-in slot has changed. Review the updated time before confirming payment.", "code": "SLOT_UNAVAILABLE"}, status=status.HTTP_400_BAD_REQUEST)
            token_num = slot_info["token"]
            if data.get("arrivalConfirmed") is not True:
                return Response({"detail": "Confirm the patient's physical arrival before booking a walk-in.", "code": "ARRIVAL_NOT_CONFIRMED"}, status=status.HTTP_400_BAD_REQUEST)
            # Check-in is saved only after successful payment below.
            appt_status = Appointment.Status.SCHEDULED
        elif mode == "PRIOR":
            date_val = data.get("date")
            time_val = data.get("time")
            if not date_val or not time_val:
                return Response({"detail": "Date and time are required for prior bookings.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                appointment_date = datetime.date.fromisoformat(date_val)
            except (TypeError, ValueError):
                return Response({"detail": "Choose a valid appointment date.", "code": "INVALID_APPOINTMENT_DATE"}, status=status.HTTP_400_BAD_REQUEST)
            earliest_prior = today + datetime.timedelta(days=1)
            latest_prior = today + datetime.timedelta(days=28)
            if not earliest_prior <= appointment_date <= latest_prior:
                return Response({
                    "detail": "Prior bookings must be scheduled from tomorrow through the next 28 days.",
                    "code": "INVALID_APPOINTMENT_DATE",
                }, status=status.HTTP_400_BAD_REQUEST)
            date_val = appointment_date.isoformat()

            same_doctor_day = Appointment.objects.select_for_update().filter(
                patient=patient, doctor=doctor, appointment_date=date_val,
            ).exclude(status=Appointment.Status.CANCELLED).exists()
            if same_doctor_day:
                return Response({
                    "detail": "This patient already has an appointment with this doctor on the selected date.",
                    "code": "DUPLICATE_DOCTOR_DAY",
                }, status=status.HTTP_409_CONFLICT)

            # Check if already booked
            is_booked = Appointment.objects.select_for_update().filter(
                doctor=doctor,
                appointment_date=date_val,
                time_slot=time_val,
                status__in=[
                    Appointment.Status.SCHEDULED,
                    Appointment.Status.CHECKED_IN,
                    Appointment.Status.IN_PROGRESS,
                    Appointment.Status.COMPLETED,
                ],
            ).exists()
            if is_booked:
                return Response({"detail": "This time slot is already booked for the selected doctor.", "code": "SLOT_UNAVAILABLE"}, status=status.HTTP_400_BAD_REQUEST)

            board = get_slot_board(doc_ident, date_val, now=now)
            slot_info = next((s for s in board if s["time"] == time_val), None)
            if not slot_info or slot_info["state"] != "free":
                return Response({"detail": "The selected appointment slot is unavailable.", "code": "SLOT_UNAVAILABLE"}, status=status.HTTP_400_BAD_REQUEST)
            token_num = slot_info["token"]
            appt_status = Appointment.Status.SCHEDULED
        else:
            return Response({"detail": "Choose Walk-in or Prior Booking.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        dept = doctor.department or doctor.staff.department
        staff = getattr(request.user, "staff", None)

        appointment = Appointment.objects.create(
            patient=patient,
            doctor=doctor,
            department=dept,
            appointment_date=date_val,
            time_slot=time_val,
            booking_mode=mode,
            appointment_type=data.get("type", "New Visit"),
            status=appt_status,
            reason=data.get("reason"),
            token_number=None,
            created_by=staff,
        )

        total_decimal = Decimal(total_paise) / Decimal("100")

        bill = Bill.objects.create(
            patient=patient,
            appointment=appointment,
            bill_date=timezone.localdate(),
            total_amount=total_decimal,
            amount_paid=Decimal("0.00"),
            payment_status=Bill.PaymentStatus.UNPAID,
            generated_by=staff,
        )

        appt_id = appointment.pk
        bill_id = bill.pk
        item_number = 1
        if registration_paise:
            BillItem.objects.create(
                bill_item_id=f"{bill_id}-item-{item_number}", bill=bill,
                item_type=BillItem.ItemType.REGISTRATION, source_id=patient.patient_id,
                description="One-time patient registration fee",
                amount=Decimal(registration_paise) / Decimal("100"),
            )
            item_number += 1
        BillItem.objects.create(
            bill_item_id=f"{bill_id}-item-{item_number}", bill=bill,
            item_type=BillItem.ItemType.CONSULTATION, source_id=appt_id,
            description=f"Consultation — {appointment.appointment_type} ({doctor.staff.name})",
            amount=Decimal(consultation_paise) / Decimal("100"),
        )

        Payment.objects.create(
            bill=bill,
            amount_paid=total_decimal,
            payment_date=timezone.localdate(),
            payment_method=method,
            received_by=staff,
            transaction_ref=payment_info.get("transactionRef"),
        )
        bill.refresh_from_db()

        bill.refresh_from_db()
        if bill.payment_status != Bill.PaymentStatus.PAID:
            raise serializers.ValidationError({"detail": "Payment was not saved in full. The booking has been rolled back.", "code": "PAYMENT_FAILED"})

        # Only assign and release the queue token after the payment record was saved.
        appointment.token_number = token_num
        if mode == "WALK_IN":
            appointment.status = Appointment.Status.CHECKED_IN
        appointment.save(update_fields=["token_number", "status", "updated_at"])

        return Response(
            {
                "appointment": AppointmentSerializer(appointment).data,
                "bill": BillSerializer(bill).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def validate_prior_arrival(self, appt):
        """Validate an existing paid reservation without allocating or charging."""
        if appt.booking_mode != Appointment.BookingMode.PRIOR:
            raise serializers.ValidationError({"detail": "This action is only for prior bookings.", "code": "INVALID_STATE"})
        if appt.appointment_date != timezone.localdate():
            raise serializers.ValidationError({"detail": "This action is only available on the appointment date.", "code": "INVALID_APPOINTMENT_DATE"})
        if not appt.token_number or appt.token_number < 1:
            raise serializers.ValidationError({"detail": "This appointment has no valid saved token. Review the record.", "code": "TOKEN_REQUIRED"})
        if not appt.patient.is_active or not appt.doctor.staff.is_active:
            raise serializers.ValidationError({"detail": "The patient or doctor is inactive. Review the appointment.", "code": "INVALID_STATE"})
        conflicts = Appointment.objects.filter(
            doctor_id=appt.doctor_id, appointment_date=appt.appointment_date,
            status__in=[Appointment.Status.SCHEDULED, Appointment.Status.CHECKED_IN, Appointment.Status.IN_PROGRESS],
        ).exclude(pk=appt.pk).filter(Q(token_number=appt.token_number) | Q(time_slot=appt.time_slot))
        if conflicts.exists():
            raise serializers.ValidationError({"detail": "Another active appointment conflicts with this reservation. Review before proceeding.", "code": "APPOINTMENT_CONFLICT"})
        bill = appt.bills.select_for_update().first()
        if not bill or bill.payment_status != Bill.PaymentStatus.PAID or bill.amount_paid < bill.total_amount:
            raise serializers.ValidationError({"detail": "The appointment bill must be fully paid.", "code": "PAYMENT_REQUIRED"})

    @action(detail=True, methods=["post"], url_path="print-token")
    @transaction.atomic
    def print_token(self, request, pk=None):
        appt = Appointment.objects.select_for_update().get(pk=self.get_object().pk)
        if appt.status != Appointment.Status.CHECKED_IN:
            raise serializers.ValidationError({"detail": "Check in the patient before printing their token.", "code": "INVALID_STATE"})
        self.validate_prior_arrival(appt)
        return Response(self.get_serializer(appt).data)

    @action(detail=True, methods=["post"], url_path="undo-no-show")
    @transaction.atomic
    def undo_no_show(self, request, pk=None):
        appt = Appointment.objects.select_for_update().get(pk=self.get_object().pk)
        if appt.status != Appointment.Status.NO_SHOW:
            raise serializers.ValidationError({"detail": "Only No-show appointments can be restored.", "code": "INVALID_STATE"})
        if request.data.get("arrivalConfirmed") is not True:
            raise serializers.ValidationError({"detail": "Confirm the patient's physical arrival first.", "code": "ARRIVAL_NOT_CONFIRMED"})
        self.validate_prior_arrival(appt)
        appt.status = Appointment.Status.SCHEDULED
        staff = getattr(request.user, "staff", None)
        actor = staff.name if staff else "Staff"
        appt.notes = (f"{appt.notes}\n" if appt.notes else "") + f"No-show undone by {actor}: late arrival confirmed; awaiting manual check-in"
        appt.save(update_fields=["status", "notes", "updated_at"])
        log_audit(action="UNDO_NO_SHOW_APPOINTMENT", entity_type="APPOINTMENT", entity_id=appt.pk,
                  details={"appointmentDate": appt.appointment_date.isoformat(), "arrivalConfirmed": True, "previousStatus": "NO_SHOW", "status": "SCHEDULED"}, request=request)
        return Response(self.get_serializer(appt).data)

    @action(detail=True, methods=["post"], url_path="check-in")
    @transaction.atomic
    def check_in(self, request, pk=None):
        """Checks in an appointment if same day and fee paid."""
        mark_expired_scheduled_appointments(request=request)
        appt = Appointment.objects.select_for_update().get(pk=self.get_object().pk)
        today = timezone.localdate()

        if appt.status != Appointment.Status.SCHEDULED:
            return Response(
                {"detail": f"Cannot check in an appointment with status {appt.status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if appt.appointment_date != today:
            return Response(
                {"detail": "Check-in is only possible on the appointment date.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if appt.booking_mode == Appointment.BookingMode.PRIOR:
            self.validate_prior_arrival(appt)

        bill = appt.bills.first()
        if not bill or bill.payment_status != Bill.PaymentStatus.PAID:
            return Response(
                {"detail": "The appointment bill must be fully paid before check-in.", "code": "PAYMENT_REQUIRED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appt.status = Appointment.Status.CHECKED_IN
        appt.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    @transaction.atomic
    def cancel(self, request, pk=None):
        """Cancels an appointment without refunding any payments."""
        appt = Appointment.objects.select_for_update().get(pk=self.get_object().pk)
        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            return Response(
                {"detail": "A cancellation reason is required.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        can_cancel_no_show = (
            appt.booking_mode == Appointment.BookingMode.PRIOR
            and appt.status == Appointment.Status.NO_SHOW
        )
        if appt.status != Appointment.Status.SCHEDULED and not can_cancel_no_show:
            return Response(
                {"detail": f"Cannot cancel an appointment with status {appt.status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff = getattr(request.user, "staff", None)
        cancelled_by_name = staff.name if staff else "Staff"

        appt.status = Appointment.Status.CANCELLED
        notes_prefix = f"{appt.notes}\n" if appt.notes else ""
        appt.notes = f"{notes_prefix}Cancelled by {cancelled_by_name}: {reason}"
        appt.save(update_fields=["status", "notes", "updated_at"])

        bill = appt.bills.first()
        if bill and bill.payment_status != Bill.PaymentStatus.CANCELLED:
            bill.payment_status = Bill.PaymentStatus.CANCELLED
            bill.save(update_fields=["payment_status", "updated_at"])

        log_audit(
            action="CANCEL_APPOINTMENT",
            entity_type="APPOINTMENT",
            entity_id=appt.appointment_id,
            details={"reason": reason, "refund": False},
            request=request,
        )

        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="no-show")
    @transaction.atomic
    def no_show(self, request, pk=None):
        """Marks appointment as NO_SHOW."""
        appt = Appointment.objects.select_for_update().get(pk=self.get_object().pk)
        if appt.status != Appointment.Status.SCHEDULED:
            return Response(
                {"detail": f"Only SCHEDULED appointments can be marked as no-show (current: {appt.status}).", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if appt.appointment_date > timezone.localdate():
            return Response({"detail": "Future appointments cannot be marked as no-show.", "code": "INVALID_STATE"}, status=status.HTTP_400_BAD_REQUEST)

        staff = getattr(request.user, "staff", None)
        marked_by_name = staff.name if staff else "Staff"

        appt.status = Appointment.Status.NO_SHOW
        notes_prefix = f"{appt.notes}\n" if appt.notes else ""
        appt.notes = f"{notes_prefix}Marked no-show by {marked_by_name}"
        appt.save(update_fields=["status", "notes", "updated_at"])

        log_audit(
            action="NO_SHOW_APPOINTMENT",
            entity_type="APPOINTMENT",
            entity_id=appt.appointment_id,
            details={"markedBy": marked_by_name},
            request=request,
        )

        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="update-status")
    @transaction.atomic
    def update_status(self, request, pk=None):
        """Supports only forward clinical transitions; check-in/no-show/cancel use guarded actions."""
        appt = Appointment.objects.select_for_update().get(pk=self.get_object().pk)
        new_status = request.data.get("status")
        if not new_status or new_status not in Appointment.Status.values:
            return Response(
                {"detail": f"Invalid status '{new_status}'.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_transitions = {
            Appointment.Status.IN_PROGRESS: {Appointment.Status.CHECKED_IN},
            Appointment.Status.COMPLETED: {Appointment.Status.IN_PROGRESS},
        }
        if appt.status not in allowed_transitions.get(new_status, set()):
            return Response(
                {"detail": "Use the guarded check-in, no-show, or cancellation action for this status change.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appt.status = new_status
        appt.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)


class BillViewSet(viewsets.ModelViewSet):
    """
    CRUD + payment receipt for Bills.
    - ADMIN, RECEPTIONIST, LAB_TECH can view and collect payments.
    - PHARMACIST can view.
    """
    serializer_class = BillSerializer
    pagination_class = ReceptionPagination

    def get_permissions(self):
        if self.action in ["list", "retrieve", "payments"]:
            return [IsRole("ADMIN", "RECEPTIONIST", "LAB_TECH", "PHARMACIST")()]
        if self.action == "receive_payment":
            return [IsRole("ADMIN", "RECEPTIONIST", "LAB_TECH")()]
        return [IsRole("ADMIN", "RECEPTIONIST")()]

    def get_queryset(self):
        qs = Bill.objects.select_related(
            "patient", "appointment", "appointment__doctor__staff",
            "appointment__doctor__department", "appointment__department", "generated_by",
        ).prefetch_related(
            "items", "payments", "payments__received_by"
        ).all().order_by("-created_at")

        patient_param = self.request.query_params.get("patient") or self.request.query_params.get("patientId")
        if patient_param:
            qs = qs.filter(patient__patient_id=patient_param)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(payment_status=status_param)

        created_date = self.request.query_params.get("created_date")
        if created_date:
            try:
                bill_day = datetime.date.fromisoformat(created_date)
            except ValueError:
                raise serializers.ValidationError({"created_date": "Enter a valid date (YYYY-MM-DD)."})
            start = timezone.make_aware(datetime.datetime.combine(bill_day, datetime.time.min))
            end = timezone.make_aware(datetime.datetime.combine(bill_day + datetime.timedelta(days=1), datetime.time.min))
            qs = qs.filter(created_at__gte=start, created_at__lt=end)

        # Retain the bill_date filter for existing billing clients.
        bill_date = self.request.query_params.get("bill_date")
        if bill_date:
            qs = qs.filter(bill_date=bill_date)

        search = self.request.query_params.get("search")
        if search:
            q = search.strip()
            qs = qs.filter(
                Q(bill_id__icontains=q) |
                Q(patient__name__icontains=q) |
                Q(patient__mrn__icontains=q)
            )

        return qs

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        role = getattr(getattr(request.user, "role", None), "role_id", None)
        if role == "RECEPTIONIST":
            qs = qs.filter(payment_status=Bill.PaymentStatus.PAID)

        appointment_date = request.query_params.get("appointment_date")
        booked_date = request.query_params.get("booked_date")
        paid_date = request.query_params.get("paid_date")
        if appointment_date:
            qs = qs.filter(appointment__appointment_date=appointment_date)
        if booked_date:
            qs = qs.filter(appointment__created_at__date=booked_date)
        if paid_date:
            qs = qs.filter(payments__payment_date=paid_date).distinct()

        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["post"], url_path="receive-payment")
    @transaction.atomic
    def receive_payment(self, request, pk=None):
        """
        Receives payment against an outstanding bill.
        Payload: { amount: <paise>, method: "CASH"|"CARD"|"UPI", transactionRef?: "..." }
        """
        bill = self.get_object()
        bill = Bill.objects.select_for_update().get(pk=bill.pk)

        if bill.payment_status in [Bill.PaymentStatus.PAID, Bill.PaymentStatus.CANCELLED]:
            return Response(
                {"detail": f"Cannot pay a bill that is {bill.payment_status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_amount = request.data.get("amount")
        try:
            amount_paise = int(raw_amount)
        except (TypeError, ValueError):
            amount_paise = 0
        if isinstance(raw_amount, bool) or str(amount_paise) != str(raw_amount).strip() or amount_paise <= 0:
            return Response(
                {"detail": "Payment amount must be greater than zero.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_decimal = Decimal(amount_paise) / Decimal("100")
        balance = bill.balance_due
        if bill.appointment_id and amount_decimal != balance:
            return Response(
                {"detail": "Appointment bills must be paid in full before the appointment can be confirmed.", "code": "FULL_PAYMENT_REQUIRED"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if amount_decimal > balance:
            bal_paise = int(round(float(balance) * 100))
            return Response(
                {"detail": f"Payment amount exceeds balance due (₹{(bal_paise/100):.2f}).", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        transaction_ref = request.data.get("transactionRef")
        lab_payment_prefix = "LAB_TEST_PAYMENT:"
        if isinstance(transaction_ref, str) and transaction_ref.startswith(lab_payment_prefix):
            expected_ref = f"{lab_payment_prefix}{bill.bill_id}"
            lab_items = BillItem.objects.filter(bill=bill, item_type=BillItem.ItemType.LAB_TEST)
            lab_total = lab_items.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
            if transaction_ref != expected_ref or lab_total <= 0:
                return Response(
                    {"detail": "Invalid laboratory payment reference for this bill.", "code": "VALIDATION_ERROR"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            all_items_are_lab_tests = not BillItem.objects.filter(bill=bill).exclude(
                item_type=BillItem.ItemType.LAB_TEST
            ).exists()
            lab_paid = bill.amount_paid if all_items_are_lab_tests else (
                Payment.objects.filter(bill=bill, transaction_ref=expected_ref).aggregate(
                    total=Sum("amount_paid")
                )["total"] or Decimal("0.00")
            )
            if amount_decimal > max(Decimal("0.00"), lab_total - lab_paid):
                return Response(
                    {"detail": "Payment amount exceeds the remaining laboratory test charges.", "code": "VALIDATION_ERROR"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        staff = getattr(request.user, "staff", None)
        method_value = request.data.get("method", "CASH")
        method = method_value.upper() if isinstance(method_value, str) else ""
        if method not in Payment.Method.values:
            return Response(
                {"detail": "Payment method must be CASH, CARD, UPI, or OTHER.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        Payment.objects.create(
            bill=bill,
            amount_paid=amount_decimal,
            payment_date=timezone.localdate(),
            payment_method=method,
            transaction_ref=transaction_ref,
            received_by=staff,
        )

        bill.refresh_from_db()

        log_audit(
            action="RECEIVE_PAYMENT",
            entity_type="BILL",
            entity_id=bill.bill_id,
            details={"amountPaise": amount_paise, "method": method},
            request=request,
        )

        return Response(BillSerializer(bill).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    @transaction.atomic
    def cancel(self, request, pk=None):
        """Cancels a bill. If payments were recorded, creates refund payment."""
        bill = self.get_object()
        if bill.payment_status == Bill.PaymentStatus.CANCELLED:
            return Response(
                {"detail": "Bill is already cancelled.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get("reason", "Cancelled by user")
        staff = getattr(request.user, "staff", None)

        if bill.amount_paid > 0:
            Payment.objects.create(
                bill=bill,
                amount_paid=-bill.amount_paid,
                payment_date=timezone.localdate(),
                payment_method=Payment.Method.OTHER,
                transaction_ref=f"REFUND: {reason}",
                received_by=staff,
            )
            bill.amount_paid = Decimal("0.00")

        bill.payment_status = Bill.PaymentStatus.CANCELLED
        bill.save(update_fields=["payment_status", "amount_paid", "updated_at"])

        log_audit(
            action="CANCEL_BILL",
            entity_type="BILL",
            entity_id=bill.bill_id,
            details={"reason": reason},
            request=request,
        )

        return Response(BillSerializer(bill).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="payments")
    def payments(self, request, pk=None):
        """Lists payments recorded against this bill."""
        bill = self.get_object()
        payments = bill.payments.all().order_by("created_at")
        return Response(PaymentSerializer(payments, many=True).data, status=status.HTTP_200_OK)


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for payments ledger."""
    serializer_class = PaymentSerializer
    pagination_class = ReceptionPagination

    def get_permissions(self):
        return [IsRole("ADMIN", "RECEPTIONIST")()]

    def get_queryset(self):
        qs = Payment.objects.select_related("bill", "bill__patient", "received_by").all().order_by("-created_at")
        bill_param = self.request.query_params.get("bill") or self.request.query_params.get("billId")
        if bill_param:
            qs = qs.filter(bill__bill_id=bill_param)
        return qs
