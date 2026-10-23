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
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from cms_backendapp.permissions import IsRole
from cms_backendapp.models import Staff, Department, Notification
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
    NO_SHOW_GRACE_MIN,
)


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
                Q(name__icontains=q) |
                Q(mrn__icontains=q) |
                Q(phone__icontains=q)
            )

        # Doctor scope: if doctor or ?doctor_scope=mine
        doctor_scope = self.request.query_params.get("doctor_scope")
        user_role = getattr(self.request.user.role, "role_id", str(self.request.user.role)) if self.request.user else ""
        if doctor_scope == "mine" or (user_role == "DOCTOR" and self.request.query_params.get("scope") == "mine"):
            staff = getattr(self.request.user, "staff", None)
            if staff:
                doc = Doctor.objects.filter(staff=staff).first()
                if doc:
                    qs = qs.filter(
                        Q(assigned_doctor=doc) |
                        Q(appointments__doctor=doc)
                    ).distinct()

        return qs

    @action(detail=False, methods=["post"], url_path="precheck")
    def precheck(self, request):
        """Validates patient registration details before payment collection."""
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return Response({"valid": True, "message": "Precheck passed."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="register-and-pay")
    @transaction.atomic
    def register_and_pay(self, request):
        """
        Registers a patient and creates a PAID registration bill + payment in one transaction.
        Payload: { patient: { ... }, payment: { method: 'CASH'|'CARD'|'UPI' } }
        """
        patient_data = request.data.get("patient") or request.data
        payment_data = request.data.get("payment", {})
        method = payment_data.get("method", "CASH").upper()

        if method not in ["CASH", "CARD", "UPI"]:
            return Response(
                {"detail": "Please select a valid payment method (CASH, CARD, UPI).", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=patient_data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        patient = serializer.save()
        staff = getattr(request.user, "staff", None)

        reg_fee_paise = get_registration_fee()
        reg_fee_decimal = Decimal(reg_fee_paise) / Decimal("100")

        # Next readable bill ID
        existing_bills = Bill.objects.filter(bill_id__startswith="bill-").values_list("bill_id", flat=True)
        max_bnum = 0
        for bid in existing_bills:
            try:
                num = int(bid.split("-")[1])
                if num > max_bnum:
                    max_bnum = num
            except Exception:
                pass
        bill_id = f"bill-{str(max_bnum + 1).zfill(3)}"

        bill = Bill.objects.create(
            bill_id=bill_id,
            patient=patient,
            bill_date=datetime.date.today(),
            total_amount=reg_fee_decimal,
            amount_paid=reg_fee_decimal,
            payment_status=Bill.PaymentStatus.PAID,
            generated_by=staff,
        )

        BillItem.objects.create(
            bill_item_id=f"{bill_id}-item-1",
            bill=bill,
            item_type=BillItem.ItemType.REGISTRATION,
            source_id=patient.patient_id,
            description="Registration fee",
            amount=reg_fee_decimal,
        )

        Payment.objects.create(
            bill=bill,
            amount_paid=reg_fee_decimal,
            payment_date=datetime.date.today(),
            payment_method=method,
            received_by=staff,
            transaction_ref=payment_data.get("transactionRef"),
        )

        return Response(
            {
                "patient": PatientSerializer(patient).data,
                "bill": BillSerializer(bill).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"], url_path="clinical-history")
    def clinical_history(self, request, pk=None):
        """Retrieves consultations, prescriptions, and lab orders for a patient."""
        patient = self.get_object()

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
        return [IsRole("ADMIN", "DOCTOR", "RECEPTIONIST")()]

    def get_queryset(self):
        qs = Appointment.objects.select_related(
            "patient", "doctor__staff", "doctor__department", "department", "created_by"
        ).prefetch_related("bills").all().order_by("appointment_date", "time_slot")

        # Filter: date
        date_param = self.request.query_params.get("date")
        if date_param:
            qs = qs.filter(appointment_date=date_param)

        # Filter: doctor
        doctor_param = self.request.query_params.get("doctor") or self.request.query_params.get("doctorId")
        if doctor_param == "me" and hasattr(self.request.user, "staff"):
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

        # Search by patient name, mrn, doctor name
        search = self.request.query_params.get("search")
        if search:
            q = search.strip()
            qs = qs.filter(
                Q(patient__name__icontains=q) |
                Q(patient__mrn__icontains=q) |
                Q(doctor__staff__name__icontains=q)
            )

        return qs

    @action(detail=False, methods=["get"], url_path="slot-board")
    def slot_board(self, request):
        """Returns slot states (free, booked, past) for doctor on date."""
        doc_ident = request.query_params.get("doctor") or request.query_params.get("doctorId")
        date_str = request.query_params.get("date") or datetime.date.today().strftime("%Y-%m-%d")
        if not doc_ident:
            return Response({"detail": "Doctor is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        board = get_slot_board(doc_ident, date_str)
        return Response(board, status=status.HTTP_200_OK)

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
    @transaction.atomic
    def book_and_pay(self, request):
        """
        Books appointment + creates PAID consultation bill + records payment in one transaction.
        """
        data = request.data
        patient_id = data.get("patientId")
        doc_ident = data.get("doctorId")
        payment_info = data.get("payment", {})
        method = payment_info.get("method", "CASH").upper()

        if not patient_id or not doc_ident:
            return Response({"detail": "Patient and doctor are required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        patient = Patient.objects.filter(pk=patient_id).first()
        if not patient or not patient.is_active:
            return Response({"detail": "Invalid or inactive patient.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        doctor = resolve_doctor(doc_ident)
        if not doctor or not doctor.staff.is_active:
            return Response({"detail": "Selected doctor is not available.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        mode = data.get("mode", "PRIOR")
        now = datetime.datetime.now()
        today_str = now.strftime("%Y-%m-%d")

        if mode == "WALK_IN":
            date_val = today_str
            slot = get_next_walkin_slot(doc_ident, now=now)
            if not slot:
                return Response({"detail": "No free slot available today for this doctor.", "code": "NO_SLOT_AVAILABLE"}, status=status.HTTP_400_BAD_REQUEST)
            time_val = slot["time"]
            token_num = slot["token"]
            appt_status = Appointment.Status.CHECKED_IN
        else:
            date_val = data.get("date")
            time_val = data.get("time")
            if not date_val or not time_val:
                return Response({"detail": "Date and time are required for prior bookings.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            if date_val < today_str:
                return Response({"detail": "Cannot book a date in the past.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

            # Check if already booked
            is_booked = Appointment.objects.filter(
                doctor=doctor,
                appointment_date=date_val,
                time_slot=time_val,
            ).exclude(status__in=["CANCELLED", "NO_SHOW"]).exists()
            if is_booked:
                return Response({"detail": "This time slot is already booked for the selected doctor.", "code": "SLOT_UNAVAILABLE"}, status=status.HTTP_400_BAD_REQUEST)

            board = get_slot_board(doc_ident, date_val, now=now)
            slot_info = next((s for s in board if s["time"] == time_val), None)
            token_num = slot_info["token"] if slot_info else 1
            appt_status = Appointment.Status.SCHEDULED

        # Appointment ID
        existing_appts = Appointment.objects.filter(appointment_id__startswith="appt-").values_list("appointment_id", flat=True)
        max_anum = 0
        for aid in existing_appts:
            try:
                num = int(aid.split("-")[1])
                if num > max_anum:
                    max_anum = num
            except Exception:
                pass
        appt_id = f"appt-{str(max_anum + 1).zfill(3)}"

        dept = doctor.department or doctor.staff.department
        staff = getattr(request.user, "staff", None)

        appointment = Appointment.objects.create(
            appointment_id=appt_id,
            patient=patient,
            doctor=doctor,
            department=dept,
            appointment_date=date_val,
            time_slot=time_val,
            appointment_type=data.get("type", "New Visit"),
            status=appt_status,
            reason=data.get("reason"),
            token_number=token_num,
            created_by=staff,
        )

        fee_paise = get_consultation_fee(doc_ident)
        fee_decimal = Decimal(fee_paise) / Decimal("100")

        # Bill ID
        existing_bills = Bill.objects.filter(bill_id__startswith="bill-").values_list("bill_id", flat=True)
        max_bnum = 0
        for bid in existing_bills:
            try:
                num = int(bid.split("-")[1])
                if num > max_bnum:
                    max_bnum = num
            except Exception:
                pass
        bill_id = f"bill-{str(max_bnum + 1).zfill(3)}"

        bill = Bill.objects.create(
            bill_id=bill_id,
            patient=patient,
            appointment=appointment,
            bill_date=datetime.date.today(),
            total_amount=fee_decimal,
            amount_paid=fee_decimal,
            payment_status=Bill.PaymentStatus.PAID,
            generated_by=staff,
        )

        BillItem.objects.create(
            bill_item_id=f"{bill_id}-item-1",
            bill=bill,
            item_type=BillItem.ItemType.CONSULTATION,
            source_id=appt_id,
            description=f"Consultation — {appointment.appointment_type} ({doctor.staff.name})",
            amount=fee_decimal,
        )

        Payment.objects.create(
            bill=bill,
            amount_paid=fee_decimal,
            payment_date=datetime.date.today(),
            payment_method=method,
            received_by=staff,
            transaction_ref=payment_info.get("transactionRef"),
        )

        return Response(
            {
                "appointment": AppointmentSerializer(appointment).data,
                "bill": BillSerializer(bill).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request, pk=None):
        """Checks in an appointment if same day and fee paid."""
        appt = self.get_object()
        today = datetime.date.today()

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

        bill = appt.bills.first()
        if bill and bill.payment_status != Bill.PaymentStatus.PAID:
            return Response(
                {"detail": "Consultation fee is unpaid. Collect payment before check-in.", "code": "PAYMENT_REQUIRED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appt.status = Appointment.Status.CHECKED_IN
        appt.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="cancel")
    @transaction.atomic
    def cancel(self, request, pk=None):
        """Cancels an appointment and handles bill cancellation/refund."""
        appt = self.get_object()
        reason = request.data.get("reason", "Cancelled by user")
        refund = request.data.get("refund", True)

        if appt.status in ["COMPLETED", "IN_PROGRESS", "CANCELLED", "NO_SHOW"]:
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
            if bill.amount_paid > 0 and refund:
                Payment.objects.create(
                    bill=bill,
                    amount_paid=-bill.amount_paid,
                    payment_date=datetime.date.today(),
                    payment_method=Payment.Method.OTHER,
                    transaction_ref="REFUND",
                    received_by=staff,
                )
            bill.payment_status = Bill.PaymentStatus.CANCELLED
            bill.save(update_fields=["payment_status", "updated_at"])

        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="no-show")
    def no_show(self, request, pk=None):
        """Marks appointment as NO_SHOW."""
        appt = self.get_object()
        if appt.status != Appointment.Status.SCHEDULED:
            return Response(
                {"detail": f"Only SCHEDULED appointments can be marked as no-show (current: {appt.status}).", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff = getattr(request.user, "staff", None)
        marked_by_name = staff.name if staff else "Staff"

        appt.status = Appointment.Status.NO_SHOW
        notes_prefix = f"{appt.notes}\n" if appt.notes else ""
        appt.notes = f"{notes_prefix}Marked no-show by {marked_by_name}"
        appt.save(update_fields=["status", "notes", "updated_at"])
        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        """Updates appointment status."""
        appt = self.get_object()
        new_status = request.data.get("status")
        if not new_status or new_status not in Appointment.Status.values:
            return Response(
                {"detail": f"Invalid status '{new_status}'.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appt.status = new_status
        appt.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(appt).data, status=status.HTTP_200_OK)


class BillViewSet(viewsets.ModelViewSet):
    """
    CRUD + payment receipt for Bills.
    - RECEPTIONIST, ADMIN can view and collect payments.
    - LAB_TECH, PHARMACIST can view.
    """
    serializer_class = BillSerializer
    pagination_class = ReceptionPagination

    def get_permissions(self):
        if self.action in ["list", "retrieve", "payments"]:
            return [IsRole("ADMIN", "RECEPTIONIST", "LAB_TECH", "PHARMACIST")()]
        return [IsRole("ADMIN", "RECEPTIONIST")()]

    def get_queryset(self):
        qs = Bill.objects.select_related("patient", "appointment", "generated_by").prefetch_related(
            "items", "payments", "payments__received_by"
        ).all().order_by("-created_at")

        patient_param = self.request.query_params.get("patient") or self.request.query_params.get("patientId")
        if patient_param:
            qs = qs.filter(patient__patient_id=patient_param)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(payment_status=status_param)

        search = self.request.query_params.get("search")
        if search:
            q = search.strip()
            qs = qs.filter(
                Q(bill_id__icontains=q) |
                Q(patient__name__icontains=q) |
                Q(patient__mrn__icontains=q)
            )

        return qs

    @action(detail=True, methods=["post"], url_path="receive-payment")
    @transaction.atomic
    def receive_payment(self, request, pk=None):
        """
        Receives payment against an outstanding bill.
        Payload: { amount: <paise>, method: "CASH"|"CARD"|"UPI", transactionRef?: "..." }
        """
        bill = self.get_object()

        if bill.payment_status in [Bill.PaymentStatus.PAID, Bill.PaymentStatus.CANCELLED]:
            return Response(
                {"detail": f"Cannot pay a bill that is {bill.payment_status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_paise = request.data.get("amount")
        if not amount_paise or int(amount_paise) <= 0:
            return Response(
                {"detail": "Payment amount must be greater than zero.", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_decimal = Decimal(int(amount_paise)) / Decimal("100")
        balance = bill.balance_due
        if amount_decimal > balance:
            bal_paise = int(round(float(balance) * 100))
            return Response(
                {"detail": f"Payment amount exceeds balance due (₹{(bal_paise/100):.2f}).", "code": "VALIDATION_ERROR"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        staff = getattr(request.user, "staff", None)
        method = request.data.get("method", "CASH").upper()

        Payment.objects.create(
            bill=bill,
            amount_paid=amount_decimal,
            payment_date=datetime.date.today(),
            payment_method=method,
            transaction_ref=request.data.get("transactionRef"),
            received_by=staff,
        )

        bill.refresh_from_db()
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
