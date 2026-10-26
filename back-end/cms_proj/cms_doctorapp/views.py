"""
cms_doctorapp/views.py
ViewSets for Doctor domain:
- DoctorViewSet
- ConsultationViewSet
- PrescriptionViewSet
- LabOrderViewSet
"""

import datetime
import math
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from cms_backendapp.permissions import IsRole
from cms_backendapp.models import Staff, User, Department, LabTestCatalog, Notification, AuditLog
from cms_backendapp.audit import log_audit
from cms_recepapp.models import Patient, Appointment, Bill, BillItem
from cms_pharmapp.models import Medicine
from .models import Doctor, ConsultationRecord, Prescription, PrescriptionItem, LabTest
from .serializers import (
    DoctorSerializer,
    ConsultationRecordSerializer,
    PrescriptionSerializer,
    PrescriptionItemSerializer,
    LabOrderSerializer,
    resolve_doctor,
)


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200


def _role_id(user):
    role = getattr(user, "role", None)
    return getattr(role, "role_id", str(role)) if role else ""


def _doctor_for_user(user):
    staff = getattr(user, "staff", None)
    return Doctor.objects.filter(staff=staff).first() if staff else None


class DoctorViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve active doctors."""
    serializer_class = DoctorSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        return [IsRole("ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECH")()]

    def get_queryset(self):
        qs = Doctor.objects.select_related("staff", "department").filter(staff__is_active=True).order_by("staff__name")
        dept = self.request.query_params.get("department")
        if dept:
            qs = qs.filter(department_id=dept)
        return qs


class ConsultationViewSet(viewsets.ModelViewSet):
    """
    Consultation management:
    - Doctor initiates/saves/locks consultation
    - Addendum after lock
    """
    serializer_class = ConsultationRecordSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        return [IsRole("ADMIN", "DOCTOR")()]

    def get_queryset(self):
        qs = ConsultationRecord.objects.select_related("patient", "doctor__staff", "appointment").all().order_by("-visit_date", "-created_at")

        if _role_id(self.request.user) == "DOCTOR":
            doctor = _doctor_for_user(self.request.user)
            qs = qs.filter(doctor=doctor) if doctor else qs.none()

        patient_param = self.request.query_params.get("patient") or self.request.query_params.get("patientId")
        if patient_param:
            qs = qs.filter(patient__patient_id=patient_param)

        doctor_param = self.request.query_params.get("doctor") or self.request.query_params.get("doctorId")
        if doctor_param == "me" and hasattr(self.request.user, "staff"):
            qs = qs.filter(doctor__staff=self.request.user.staff)
        elif doctor_param:
            qs = qs.filter(Q(doctor__staff__staff_id=doctor_param) | Q(doctor__doctor_id=doctor_param))

        return qs

    @action(detail=False, methods=["post"], url_path="get-or-create")
    @transaction.atomic
    def get_or_create_consultation(self, request):
        """
        Retrieves existing consultation for appointment, or initializes a new draft
        and advances appointment status to IN_PROGRESS.
        """
        appt_id = request.data.get("appointmentId")
        if not appt_id:
            return Response({"detail": "appointmentId is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        appointment = Appointment.objects.select_for_update().filter(pk=appt_id).first()
        if not appointment:
            return Response({"detail": f"Appointment '{appt_id}' not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if _role_id(request.user) == "DOCTOR":
            doctor = _doctor_for_user(request.user)
            if doctor is None or appointment.doctor_id != doctor.doctor_id:
                return Response({"detail": "Appointment not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        # Check existing
        existing = ConsultationRecord.objects.filter(appointment=appointment).first()
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

        if appointment.status not in {Appointment.Status.CHECKED_IN, Appointment.Status.IN_PROGRESS}:
            return Response(
                {"detail": "The patient must be checked in before a consultation can start.", "code": "INVALID_APPOINTMENT_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate record ID
        existing_recs = ConsultationRecord.objects.filter(record_id__startswith="con-").values_list("record_id", flat=True)
        max_num = 0
        for rid in existing_recs:
            try:
                num = int(rid.split("-")[1])
                if num > max_num:
                    max_num = num
            except Exception:
                pass
        rec_id = f"con-{str(max_num + 1).zfill(3)}"

        consultation = ConsultationRecord.objects.create(
            record_id=rec_id,
            patient=appointment.patient,
            doctor=appointment.doctor,
            appointment=appointment,
            visit_date=timezone.localdate(),
            is_completed=False,
            vital_signs={},
            addendums=[],
        )

        # Transition appointment to IN_PROGRESS
        appointment.status = Appointment.Status.IN_PROGRESS
        appointment.save(update_fields=["status", "updated_at"])

        return Response(self.get_serializer(consultation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="save-draft")
    def save_draft(self, request, pk=None):
        """Saves symptoms, diagnosis, notes, and vital signs on an uncompleted consultation."""
        consultation = self.get_object()
        if consultation.is_completed:
            return Response(
                {"detail": "Cannot modify a completed consultation. Please use addendum.", "code": "LOCKED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = request.data
        if "symptoms" in data:
            consultation.symptoms = data["symptoms"]
        if "diagnosis" in data:
            consultation.diagnosis = data["diagnosis"]
        if "notes" in data:
            consultation.notes = data["notes"]
        if "vitalSigns" in data:
            consultation.vital_signs = data["vitalSigns"]

        consultation.save()
        return Response(self.get_serializer(consultation).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="complete")
    @transaction.atomic
    def complete(self, request, pk=None):
        """Locks consultation and sets appointment status to COMPLETED."""
        consultation = self.get_object()
        if consultation.is_completed:
            return Response(self.get_serializer(consultation).data, status=status.HTTP_200_OK)

        data = request.data
        if "symptoms" in data:
            consultation.symptoms = data["symptoms"]
        if "diagnosis" in data:
            consultation.diagnosis = data["diagnosis"]
        if "notes" in data:
            consultation.notes = data["notes"]
        if "vitalSigns" in data:
            consultation.vital_signs = data["vitalSigns"]

        consultation.is_completed = True
        consultation.save()

        if consultation.appointment:
            consultation.appointment.status = Appointment.Status.COMPLETED
            consultation.appointment.save(update_fields=["status", "updated_at"])

        log_audit(
            action="COMPLETE_CONSULTATION",
            entity_type="CONSULTATION",
            entity_id=consultation.record_id,
            details={"patientId": consultation.patient_id, "appointmentId": consultation.appointment_id},
            request=request,
        )

        return Response(self.get_serializer(consultation).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="addendum")
    def addendum(self, request, pk=None):
        """Adds post-completion addendum note."""
        consultation = self.get_object()
        if not consultation.is_completed:
            return Response(
                {"detail": "Addenda can only be added to completed consultations.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        text = request.data.get("text", "").strip()
        if not text:
            return Response({"detail": "Addendum text is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        staff = getattr(request.user, "staff", None)
        entry = {
            "text": text,
            "doctorId": staff.staff_id if staff else "doctor",
            "doctorName": staff.name if staff else "Doctor",
            "createdAt": timezone.now().isoformat(),
        }

        if not isinstance(consultation.addendums, list):
            consultation.addendums = []
        consultation.addendums.append(entry)
        consultation.save(update_fields=["addendums", "updated_at"])

        return Response(self.get_serializer(consultation).data, status=status.HTTP_200_OK)


class PrescriptionViewSet(viewsets.ModelViewSet):
    """
    Prescription lifecycle:
    - DOCTOR creates with allergy checking & cancel
    - PHARMACIST reads and dispenses
    """
    serializer_class = PrescriptionSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action in ["dispense", "reject"]:
            return [IsRole("ADMIN", "PHARMACIST")()]
        if self.action in ["create", "cancel"]:
            return [IsRole("ADMIN", "DOCTOR")()]
        return [IsRole("ADMIN", "DOCTOR", "PHARMACIST")()]

    def get_queryset(self):
        qs = Prescription.objects.select_related(
            "patient", "doctor__staff", "consultation", "dispensed_by"
        ).prefetch_related("items__medicine").all().order_by("-date_issued", "-created_at")

        if _role_id(self.request.user) == "DOCTOR":
            doctor = _doctor_for_user(self.request.user)
            qs = qs.filter(doctor=doctor) if doctor else qs.none()

        patient_param = self.request.query_params.get("patient") or self.request.query_params.get("patientId")
        if patient_param:
            qs = qs.filter(patient__patient_id=patient_param)

        doctor_param = self.request.query_params.get("doctor") or self.request.query_params.get("doctorId")
        if doctor_param == "me" and hasattr(self.request.user, "staff"):
            qs = qs.filter(doctor__staff=self.request.user.staff)
        elif doctor_param:
            qs = qs.filter(Q(doctor__staff__staff_id=doctor_param) | Q(doctor__doctor_id=doctor_param))

        status_param = self.request.query_params.get("status")
        if status_param:
            statuses = [s.strip() for s in status_param.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Creates a new prescription with patient allergy checking.
        Body: { consultationId?, patientId, doctorId, items: [...], notes?, explicitOverride? }
        """
        data = request.data
        patient_id = data.get("patientId")
        doc_ident = data.get("doctorId")
        items_data = data.get("items", [])
        explicit_override = bool(data.get("explicitOverride", False))

        if not patient_id or not items_data:
            return Response({"detail": "patientId and items are required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(items_data, list) or any(not isinstance(item, dict) for item in items_data):
            return Response({"detail": "items must be a list of medicine instructions.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        own_doctor = _doctor_for_user(request.user) if _role_id(request.user) == "DOCTOR" else None
        if _role_id(request.user) == "DOCTOR":
            if own_doctor is None:
                return Response({"detail": "This account is not linked to a doctor profile."}, status=status.HTTP_403_FORBIDDEN)
            requested_doctor = resolve_doctor(doc_ident) if doc_ident else None
            if requested_doctor and requested_doctor.pk != own_doctor.pk:
                return Response({"detail": "You can only prescribe as your own doctor account."}, status=status.HTTP_403_FORBIDDEN)

        for item in items_data:
            duration = item.get("durationDays")
            if isinstance(duration, bool) or duration is None:
                return Response({"detail": "A duration in days is required for every prescribed medicine.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                parsed_duration = int(duration)
            except (TypeError, ValueError):
                parsed_duration = 0
            if parsed_duration < 1 or str(duration).strip() != str(parsed_duration):
                return Response({"detail": "Each medicine duration must be a whole number of days greater than zero.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            if _role_id(request.user) == "DOCTOR" and "quantity" in item:
                return Response({"detail": "Dispensing quantity is set by the pharmacist.", "code": "PHARMACIST_QUANTITY_REQUIRED"}, status=status.HTTP_400_BAD_REQUEST)
            item["durationDays"] = parsed_duration

        patient = Patient.objects.filter(pk=patient_id).first()
        if not patient:
            return Response({"detail": "Patient not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if _role_id(request.user) == "DOCTOR":
            if own_doctor is None:
                return Response({"detail": "This account is not linked to a doctor profile."}, status=status.HTTP_403_FORBIDDEN)
            if not doc_ident:
                doc_ident = own_doctor.staff.staff_id
        elif not doc_ident and getattr(request.user, "staff", None):
            doc_ident = request.user.staff.staff_id

        doctor = resolve_doctor(doc_ident)
        if not doctor:
            return Response({"detail": "Doctor not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if _role_id(request.user) == "DOCTOR":
            if own_doctor is None or doctor.pk != own_doctor.pk:
                return Response({"detail": "You can only prescribe as your own doctor account."}, status=status.HTTP_403_FORBIDDEN)
            if not Patient.objects.filter(pk=patient.pk).filter(
                Q(assigned_doctor=own_doctor) | Q(appointments__doctor=own_doctor)
            ).exists():
                return Response({"detail": "Patient not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        # Allergy checking
        patient_allergies = []
        if patient.allergies:
            if isinstance(patient.allergies, list):
                patient_allergies = [a.lower().strip() for a in patient.allergies]
            else:
                patient_allergies = [a.lower().strip() for a in patient.allergies.split(",") if a.strip()]

        flagged_allergies = []
        resolved_items = []

        for item in items_data:
            med_id = item.get("medicineId")
            med = Medicine.objects.filter(pk=med_id).first()
            if not med:
                return Response({"detail": f"Medicine '{med_id}' not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

            # Check allergy against medicine name or generic name
            for allergy in patient_allergies:
                if (allergy in med.name.lower()) or (allergy in med.generic_name.lower()):
                    flagged_allergies.append(f"{med.name} ({allergy})")

            resolved_items.append((med, item))

        if flagged_allergies and not explicit_override:
            return Response(
                {
                    "detail": f"Patient is allergic to: {', '.join(flagged_allergies)}. Please explicitly override if intended.",
                    "code": "ALLERGY_ALERT",
                    "allergies": flagged_allergies,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate prescription ID
        existing_rxs = Prescription.objects.filter(prescription_id__startswith="rx-").values_list("prescription_id", flat=True)
        max_num = 0
        for rid in existing_rxs:
            try:
                num = int(rid.split("-")[1])
                if num > max_num:
                    max_num = num
            except Exception:
                pass
        rx_id = f"rx-{str(max_num + 1).zfill(3)}"

        consultation = None
        con_id = data.get("consultationId")
        if con_id:
            consultation = ConsultationRecord.objects.filter(pk=con_id).first()
            if not consultation:
                return Response({"detail": "Consultation not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)
            if consultation.patient_id != patient.patient_id or consultation.doctor_id != doctor.doctor_id:
                return Response(
                    {"detail": "The consultation must belong to the selected patient and doctor.", "code": "CONSULTATION_MISMATCH"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        appointment = consultation.appointment if consultation else None

        prescription = Prescription.objects.create(
            prescription_id=rx_id,
            consultation=consultation,
            patient=patient,
            doctor=doctor,
            appointment=appointment,
            date_issued=datetime.date.today(),
            status=Prescription.Status.PENDING,
            notes=data.get("notes"),
        )

        for idx, (med, item_dict) in enumerate(resolved_items, 1):
            PrescriptionItem.objects.create(
                item_id=f"{rx_id}-item-{idx}",
                prescription=prescription,
                medicine=med,
                dosage=item_dict.get("dosage", "1-0-1"),
                duration_days=item_dict["durationDays"],
                instructions=item_dict.get("instructions", "After food"),
                frequency=item_dict.get("frequency", "Twice daily"),
                quantity=item_dict.get("quantity", 1),
            )

        return Response(self.get_serializer(prescription).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        """Cancels a pending prescription."""
        prescription = self.get_object()
        if prescription.status != Prescription.Status.PENDING:
            return Response(
                {"detail": f"Cannot cancel a prescription that is {prescription.status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prescription.status = Prescription.Status.CANCELLED
        prescription.save(update_fields=["status", "updated_at"])

        log_audit(
            action="CANCEL_PRESCRIPTION",
            entity_type="PRESCRIPTION",
            entity_id=prescription.prescription_id,
            details={"patientId": prescription.patient_id},
            request=request,
        )

        return Response(self.get_serializer(prescription).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="dispense")
    @transaction.atomic
    def dispense(self, request, pk=None):
        """
        Dispenses medicines for this prescription:
        - Deducts stock per batch using FEFO
        - Writes StockLedgerEntry
        - Updates status to DISPENSED / PARTIALLY_DISPENSED
        - Creates pharmacy bill & payment if paid
        """
        prescription = self.get_object()
        prescription = Prescription.objects.select_for_update().get(pk=prescription.pk)
        if prescription.status in [Prescription.Status.DISPENSED, Prescription.Status.CANCELLED]:
            return Response(
                {"detail": f"Cannot dispense a prescription that is {prescription.status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prescription_items = list(
            PrescriptionItem.objects.select_for_update()
            .filter(prescription=prescription)
            .order_by("item_id")
        )
        if not prescription_items:
            return Response({"detail": "This prescription has no medicine items to dispense.", "code": "INVALID_PRESCRIPTION"}, status=status.HTTP_400_BAD_REQUEST)

        medicines = {
            medicine.pk: medicine
            for medicine in Medicine.objects.select_for_update()
            .filter(pk__in=[item.medicine_id for item in prescription_items])
            .order_by("medicine_id")
        }
        for item in prescription_items:
            item.medicine = medicines[item.medicine_id]

        submitted_items = request.data.get("items")
        if not isinstance(submitted_items, list):
            return Response({"detail": "Provide a dispensing quantity for every prescribed medicine.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        quantities = {}
        for submitted in submitted_items:
            if not isinstance(submitted, dict) or not submitted.get("itemId") or submitted["itemId"] in quantities:
                return Response({"detail": "Each medicine must have one valid itemId and quantity.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            raw_quantity = submitted.get("quantity")
            if isinstance(raw_quantity, bool):
                return Response({"detail": "Dispensing quantities must be whole numbers greater than zero.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                quantity = int(raw_quantity)
            except (TypeError, ValueError):
                quantity = 0
            if quantity < 1 or str(raw_quantity).strip() != str(quantity):
                return Response({"detail": "Dispensing quantities must be whole numbers greater than zero.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            quantities[submitted["itemId"]] = quantity

        expected_ids = {item.item_id for item in prescription_items}
        if set(quantities) != expected_ids:
            return Response({"detail": "Provide a dispensing quantity for every prescribed medicine.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        requested_by_medicine = {}
        for item in prescription_items:
            requested_by_medicine[item.medicine_id] = requested_by_medicine.get(item.medicine_id, 0) + quantities[item.item_id]

        for medicine_id, requested_quantity in requested_by_medicine.items():
            medicine = medicines[medicine_id]
            available = max(0, medicine.stock_quantity)
            if isinstance(medicine.batches, list) and medicine.batches:
                try:
                    batch_stock = sum(max(0, int(batch.get("quantity", 0))) for batch in medicine.batches if isinstance(batch, dict))
                except (TypeError, ValueError):
                    batch_stock = 0
                available = min(available, batch_stock)
            if requested_quantity > available:
                return Response(
                    {"detail": f"The requested quantity for {medicine.name} exceeds available stock.", "code": "INSUFFICIENT_STOCK", "availableQuantity": available},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        for item in prescription_items:
            item.quantity = quantities[item.item_id]

        payment_info = request.data.get("payment", {})
        staff = getattr(request.user, "staff", None)

        from cms_pharmapp.models import StockLedgerEntry
        all_dispensed = True
        total_cost = Decimal("0.00")

        for item in prescription_items:
            med = item.medicine
            req_qty = item.quantity
            deducted = 0
            dispensed_batch_no = "GENERAL"

            batches = list(med.batches) if isinstance(med.batches, list) else []
            batches.sort(key=lambda b: str(b.get("expiryDate") or "9999-12-31"))

            remaining = req_qty
            if batches:
                for batch in batches:
                    b_qty = max(0, int(batch.get("quantity", 0)))
                    if b_qty > 0:
                        take = min(b_qty, remaining)
                        if deducted == 0:
                            dispensed_batch_no = batch.get("batchNo") or "GENERAL"
                        batch["quantity"] = b_qty - take
                        remaining -= take
                        deducted += take
                        if remaining <= 0:
                            break
            else:
                deducted = min(req_qty, max(0, med.stock_quantity))

            med.batches = batches
            med.stock_quantity = max(0, med.stock_quantity - deducted)
            med.save(update_fields=["batches", "stock_quantity", "updated_at"])
            item.save(update_fields=["quantity"])

            if deducted < req_qty:
                all_dispensed = False

            total_cost += Decimal(deducted) * med.selling_price

            StockLedgerEntry.objects.create(
                medicine=med,
                batch_no=dispensed_batch_no,
                entry_type="DISPENSE",
                quantity=-deducted,
                reference_id=prescription.prescription_id,
                note=f"Dispensed for Rx {prescription.prescription_id}",
                performed_by=staff,
            )

        prescription.status = Prescription.Status.DISPENSED if all_dispensed else Prescription.Status.PARTIALLY_DISPENSED
        prescription.dispensed_by = staff
        prescription.dispensed_at = timezone.now()
        prescription.save(update_fields=["status", "dispensed_by", "dispensed_at", "updated_at"])

        if total_cost > 0:
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

            is_paid = payment_info.get("status") == "PAID"
            bill = Bill.objects.create(
                bill_id=bill_id,
                patient=prescription.patient,
                bill_date=datetime.date.today(),
                total_amount=total_cost,
                amount_paid=Decimal("0.00"),
                payment_status=Bill.PaymentStatus.UNPAID,
                generated_by=staff,
            )

            BillItem.objects.create(
                bill_item_id=f"{bill_id}-item-1",
                bill=bill,
                item_type=BillItem.ItemType.PHARMACY,
                source_id=prescription.prescription_id,
                description=f"Pharmacy Dispense for Rx {prescription.prescription_id}",
                amount=total_cost,
            )

            if is_paid:
                from cms_recepapp.models import Payment
                Payment.objects.create(
                    bill=bill,
                    amount_paid=total_cost,
                    payment_date=datetime.date.today(),
                    payment_method=payment_info.get("method", "CASH"),
                    transaction_ref=payment_info.get("transactionRef"),
                    received_by=staff,
                )

        log_audit(
            action="DISPENSE_PRESCRIPTION",
            entity_type="PRESCRIPTION",
            entity_id=prescription.prescription_id,
            details={
                "status": prescription.status,
                "totalCost": int(round(float(total_cost) * 100)),
            },
            request=request,
        )

        return Response(self.get_serializer(prescription).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        """Rejects a prescription."""
        prescription = self.get_object()
        reason = request.data.get("reason", "Rejected by pharmacy")
        prescription.status = Prescription.Status.CANCELLED
        notes_prefix = f"{prescription.notes}\n" if prescription.notes else ""
        prescription.notes = f"{notes_prefix}Rejected by pharmacy: {reason}"
        prescription.save(update_fields=["status", "notes", "updated_at"])
        return Response(self.get_serializer(prescription).data, status=status.HTTP_200_OK)


class LabOrderViewSet(viewsets.ModelViewSet):
    """
    Lab Test Orders:
    - DOCTOR raises order
    - LAB_TECH updates status and enters results
    """
    serializer_class = LabOrderSerializer
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action in ["create", "cancel"]:
            return [IsRole("ADMIN", "DOCTOR")()]
        if self.action in ["update_status", "enter_result"]:
            return [IsRole("ADMIN", "LAB_TECH")()]
        return [IsRole("ADMIN", "DOCTOR", "LAB_TECH")()]

    def get_queryset(self):
        qs = LabTest.objects.select_related(
            "patient", "doctor__staff", "test_catalog", "technician"
        ).all().order_by("-ordered_date", "-created_at")

        if _role_id(self.request.user) == "DOCTOR":
            doctor = _doctor_for_user(self.request.user)
            qs = qs.filter(doctor=doctor) if doctor else qs.none()

        patient_param = self.request.query_params.get("patient") or self.request.query_params.get("patientId")
        if patient_param:
            qs = qs.filter(patient__patient_id=patient_param)

        doctor_param = self.request.query_params.get("doctor") or self.request.query_params.get("doctorId")
        if doctor_param == "me" and hasattr(self.request.user, "staff"):
            qs = qs.filter(doctor__staff=self.request.user.staff)
        elif doctor_param:
            qs = qs.filter(Q(doctor__staff__staff_id=doctor_param) | Q(doctor__doctor_id=doctor_param))

        status_param = self.request.query_params.get("status")
        if status_param:
            statuses = [s.strip() for s in status_param.split(",") if s.strip()]
            qs = qs.filter(status__in=statuses)

        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Raises a new lab order and creates an UNPAID bill item.
        Body: { patientId, doctorId, testId, priority?, notes? }
        """
        data = request.data
        patient_id = data.get("patientId")
        doc_ident = data.get("doctorId")
        catalog_id = data.get("testId")

        if not patient_id or not catalog_id:
            return Response({"detail": "patientId and testId are required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        patient = Patient.objects.filter(pk=patient_id).first()
        if not patient:
            return Response({"detail": "Patient not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if _role_id(request.user) == "DOCTOR":
            own_doctor = _doctor_for_user(request.user)
            if own_doctor is None:
                return Response({"detail": "This account is not linked to a doctor profile."}, status=status.HTTP_403_FORBIDDEN)
            if not doc_ident:
                doc_ident = own_doctor.staff.staff_id
        elif not doc_ident and getattr(request.user, "staff", None):
            doc_ident = request.user.staff.staff_id

        doctor = resolve_doctor(doc_ident)
        if not doctor:
            return Response({"detail": "Doctor not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if _role_id(request.user) == "DOCTOR":
            own_doctor = _doctor_for_user(request.user)
            if own_doctor is None or doctor.pk != own_doctor.pk:
                return Response({"detail": "You can only order tests as your own doctor account."}, status=status.HTTP_403_FORBIDDEN)
            if not Patient.objects.filter(pk=patient.pk).filter(
                Q(assigned_doctor=own_doctor) | Q(appointments__doctor=own_doctor)
            ).exists():
                return Response({"detail": "Patient not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        catalog = LabTestCatalog.objects.filter(pk=catalog_id).first()
        if not catalog:
            return Response({"detail": "Lab test catalog item not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        existing_labs = LabTest.objects.filter(test_id__startswith="lab-").values_list("test_id", flat=True)
        max_num = 0
        for lid in existing_labs:
            try:
                num = int(lid.split("-")[1])
                if num > max_num:
                    max_num = num
            except Exception:
                pass
        lab_id = f"lab-{str(max_num + 1).zfill(3)}"

        order = LabTest.objects.create(
            test_id=lab_id,
            patient=patient,
            doctor=doctor,
            test_catalog=catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.ORDERED,
            priority=data.get("priority", "Routine"),
            notes=data.get("notes"),
        )

        bill = Bill.objects.create(
            patient=patient,
            bill_date=datetime.date.today(),
            total_amount=catalog.price,
            generated_by=getattr(request.user, "staff", None) or doctor.staff,
        )
        BillItem.objects.create(
            bill=bill,
            item_type=BillItem.ItemType.LAB_TEST,
            source_id=order.test_id,
            description=f"Lab Test — {catalog.test_name}",
            amount=catalog.price,
        )

        Notification.objects.create(
            notification_type="LAB_ORDER",
            title="New Laboratory Order",
            message=f"{doctor.staff.name} ordered {catalog.test_name} for {patient.name} ({patient.mrn}).",
            target_role="LAB_TECH",
            link="/lab/test-queue",
        )

        return Response(self.get_serializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        """Cancels an ordered lab test."""
        order = self.get_object()
        if order.status != LabTest.Status.ORDERED:
            return Response(
                {"detail": f"Cannot cancel lab order with status {order.status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = LabTest.Status.CANCELLED
        order.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        """Advance a lab order through the collection and processing workflow."""
        order = self.get_object()
        new_status = request.data.get("status")
        tech_id = request.data.get("technicianId")
        transitions = {
            LabTest.Status.ORDERED: {LabTest.Status.SAMPLE_COLLECTED},
            LabTest.Status.SAMPLE_COLLECTED: {LabTest.Status.PROCESSING},
            LabTest.Status.PROCESSING: {LabTest.Status.IN_PROGRESS},
            LabTest.Status.IN_PROGRESS: set(),
        }
        if new_status == order.status:
            return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)
        if new_status not in transitions.get(order.status, set()):
            return Response(
                {"detail": f"Cannot move a {order.status} order to {new_status or 'an empty status'}. Enter a result to complete an order.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_status == "SAMPLE_COLLECTED" and not order.sample_collected_at:
            order.sample_collected_at = timezone.now()

        if tech_id:
            tech = Staff.objects.filter(Q(staff_id=tech_id) | Q(pk=tech_id)).first()
            if not tech or not tech.is_active or getattr(getattr(tech, "role", None), "role_id", None) != "LAB_TECH":
                return Response({"detail": "Technician must be an active Lab Technician.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
            order.technician = tech
        elif _role_id(request.user) == "LAB_TECH" and hasattr(request.user, "staff"):
            order.technician = request.user.staff

        order.status = new_status
        order.save()
        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="enter-result")
    @transaction.atomic
    def enter_result(self, request, pk=None):
        """
        Enters test results, checks critical ranges, marks COMPLETED, notifies doctor.
        """
        order = self.get_object()
        results_data = request.data.get("results")
        tech_id = request.data.get("technicianId")
        remarks = request.data.get("remarks")
        is_critical = bool(request.data.get("isCritical", False))

        if order.status not in [LabTest.Status.PROCESSING, LabTest.Status.IN_PROGRESS, LabTest.Status.COMPLETED]:
            return Response(
                {"detail": "Collect and process the specimen before entering results.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(results_data, (dict, list)) or not results_data:
            return Response({"detail": "At least one test result is required.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        def result_for(parameter_name):
            if isinstance(results_data, dict):
                return results_data.get(parameter_name)
            for item in results_data:
                if isinstance(item, dict) and item.get("parameter") == parameter_name:
                    return item.get("value")
            return None

        params = order.test_catalog.parameters or []
        for parameter in params:
            name = parameter.get("name")
            raw_value = result_for(name) if name else None
            if name and parameter.get("required") is not False and (raw_value is None or not str(raw_value).strip()):
                return Response(
                    {"detail": f"A result is required for {name}.", "code": "VALIDATION_ERROR"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data_type = str(parameter.get("dataType") or parameter.get("type") or "").lower()
            has_numeric_range = any(
                parameter.get(key) is not None
                for key in ("refMin", "refMax", "min", "max", "criticalMin", "criticalMax", "criticalLow", "criticalHigh")
            )
            is_numeric = data_type in {"number", "numeric", "integer", "decimal"} or (
                data_type not in {"text", "string", "qualitative", "boolean", "choice"}
                and bool(parameter.get("unit") or has_numeric_range)
            )
            if raw_value is not None and str(raw_value).strip() and is_numeric:
                try:
                    numeric_value = float(raw_value)
                    if not math.isfinite(numeric_value) or (data_type == "integer" and not numeric_value.is_integer()):
                        raise ValueError
                except (ValueError, TypeError):
                    return Response(
                        {"detail": f"{name} must be a valid {data_type} value.", "code": "VALIDATION_ERROR"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        tech = None
        if tech_id:
            tech = Staff.objects.filter(Q(staff_id=tech_id) | Q(pk=tech_id)).first()
            if not tech or not tech.is_active or getattr(getattr(tech, "role", None), "role_id", None) != "LAB_TECH":
                return Response({"detail": "Technician must be an active Lab Technician.", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)
        if not tech and hasattr(request.user, "staff"):
            tech = request.user.staff

        # Use only ranges defined by the catalog to flag numeric values. These
        # flags describe the supplied reference range and are not a diagnosis.
        stored_results = [] if params else results_data
        for p in params:
            pname = p.get("name")
            raw_value = result_for(pname) if pname else None
            if raw_value is not None:
                flag = None
                try:
                    val = float(raw_value)
                    c_low = p.get("criticalMin", p.get("criticalLow"))
                    c_high = p.get("criticalMax", p.get("criticalHigh"))
                    ref_low = p.get("refMin")
                    ref_high = p.get("refMax")
                    if c_low is not None and val <= float(c_low):
                        is_critical = True
                        flag = "critical_low"
                    if c_high is not None and val >= float(c_high):
                        is_critical = True
                        flag = "critical_high"
                    if flag is None and (ref_low is not None or ref_high is not None):
                        flag = "low" if ref_low is not None and val < float(ref_low) else "high" if ref_high is not None and val > float(ref_high) else "normal"
                except (ValueError, TypeError):
                    pass
                stored_results.append({
                    "parameter": pname,
                    "value": raw_value,
                    "unit": p.get("unit") or "",
                    **({"flag": flag} if flag else {}),
                })

        from cms_labapp.models import LabTestResult
        existing_labr = LabTestResult.objects.filter(result_id__startswith="labr-").values_list("result_id", flat=True)
        max_num = 0
        for r in existing_labr:
            try:
                num = int(r.split("-")[1])
                if num > max_num:
                    max_num = num
            except Exception:
                pass
        res_id = f"labr-{str(max_num + 1).zfill(3)}"

        lab_result, _ = LabTestResult.objects.update_or_create(
            test=order,
            defaults={
                "result_id": res_id,
                "performed_by": tech or order.doctor.staff,
                "result_date": datetime.date.today(),
                "results": stored_results,
                "is_critical": is_critical,
                "remarks": remarks or ("Critical values detected" if is_critical else "Results validated"),
            }
        )

        order.status = LabTest.Status.COMPLETED
        order.completed_at = timezone.now()
        if tech:
            order.technician = tech
        order.save(update_fields=["status", "completed_at", "technician", "updated_at"])

        notification_recipient = None
        if is_critical and order.doctor:
            doc_user = User.objects.filter(staff=order.doctor.staff).first()
            if doc_user:
                if isinstance(stored_results, list):
                    result_rows = stored_results
                elif isinstance(stored_results, dict):
                    result_rows = [
                        {"parameter": name, "value": value}
                        for name, value in stored_results.items()
                    ]
                else:
                    result_rows = []
                critical_rows = [
                    result for result in result_rows
                    if isinstance(result, dict) and str(result.get("flag", "")).startswith("critical_")
                ]
                alert_rows = critical_rows or [
                    result for result in result_rows if isinstance(result, dict)
                ]
                critical_detail_parts = []
                for result in alert_rows:
                    detail = f"{result.get('parameter', 'Result')}: {result.get('value', '')}"
                    if result.get("unit"):
                        detail += f" {result['unit']}"
                    if result.get("flag"):
                        detail += f" ({str(result['flag']).replace('critical_', 'critical ')})"
                    critical_detail_parts.append(detail)
                critical_details = "; ".join(critical_detail_parts)
                patient_identifier = f" (MRN: {order.patient.mrn})" if order.patient.mrn else ""
                detail_text = f" Critical values: {critical_details}." if critical_details else ""
                prescribing_doctor = order.doctor.staff.name
                Notification.objects.create(
                    notification_type="LAB_RESULT",
                    title="Critical Lab Result",
                    message=(
                        f"Critical {order.test_catalog.test_name} result: patient "
                        f"{order.patient.name}{patient_identifier} has a critical result for order "
                        f"{order.test_id}.{detail_text} Sent to prescribing doctor {prescribing_doctor}."
                    ),
                    target_user=doc_user,
                    link="/doctor/lab-orders",
                )
                tech_user = User.objects.filter(staff=tech).first() if tech else None
                if not tech_user and _role_id(request.user) == "LAB_TECH":
                    tech_user = request.user
                if tech_user:
                    Notification.objects.create(
                        notification_type="LAB_RESULT_SENT",
                        title="Critical Result Sent to Doctor",
                        message=(
                            f"Critical {order.test_catalog.test_name} result for "
                            f"{order.patient.name}{patient_identifier} was sent to prescribing "
                            f"doctor {prescribing_doctor}. Critical values: "
                            f"{critical_details or 'See the saved result'}."
                        ),
                        target_user=tech_user,
                        link="/lab/completed-tests",
                    )
                notification_recipient = order.doctor.staff.name

        response_data = self.get_serializer(order).data
        response_data["notificationSent"] = notification_recipient is not None
        response_data["notificationRecipient"] = notification_recipient
        return Response(response_data, status=status.HTTP_200_OK)
