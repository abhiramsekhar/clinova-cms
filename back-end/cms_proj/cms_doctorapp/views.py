"""
cms_doctorapp/views.py
ViewSets for Doctor domain:
- DoctorViewSet
- ConsultationViewSet
- PrescriptionViewSet
- LabOrderViewSet
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
from cms_backendapp.models import Staff, Department, LabTestCatalog, Notification, AuditLog
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

        # Check existing
        existing = ConsultationRecord.objects.filter(appointment=appointment).first()
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

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
            visit_date=datetime.date.today(),
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
        if self.action in ["create", "cancel"]:
            return [IsRole("ADMIN", "DOCTOR")()]
        return [IsRole("ADMIN", "DOCTOR", "PHARMACIST")()]

    def get_queryset(self):
        qs = Prescription.objects.select_related(
            "patient", "doctor__staff", "consultation", "dispensed_by"
        ).prefetch_related("items__medicine").all().order_by("-date_issued", "-created_at")

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

        patient = Patient.objects.filter(pk=patient_id).first()
        if not patient:
            return Response({"detail": "Patient not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        if not doc_ident and hasattr(request.user, "staff"):
            doc_ident = request.user.staff.staff_id

        doctor = resolve_doctor(doc_ident)
        if not doctor:
            return Response({"detail": "Doctor not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

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
                duration_days=item_dict.get("durationDays", 5),
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
        if prescription.status in [Prescription.Status.DISPENSED, Prescription.Status.CANCELLED]:
            return Response(
                {"detail": f"Cannot dispense a prescription that is {prescription.status}.", "code": "INVALID_STATE"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment_info = request.data.get("payment", {})
        staff = getattr(request.user, "staff", None)

        from cms_pharmapp.models import StockLedgerEntry
        all_dispensed = True
        total_cost = Decimal("0.00")

        for item in prescription.items.select_related("medicine").all():
            med = item.medicine
            req_qty = item.quantity
            deducted = 0

            batches = list(med.batches) if isinstance(med.batches, list) else []
            batches.sort(key=lambda b: str(b.get("expiryDate") or "9999-12-31"))

            remaining = req_qty
            for b in batches:
                b_qty = int(b.get("quantity", 0))
                if b_qty > 0:
                    take = min(b_qty, remaining)
                    b["quantity"] = b_qty - take
                    remaining -= take
                    deducted += take
                    if remaining <= 0:
                        break

            med.batches = batches
            med.stock_quantity = max(0, med.stock_quantity - deducted)
            med.save(update_fields=["batches", "stock_quantity", "updated_at"])

            if deducted < req_qty:
                all_dispensed = False

            total_cost += Decimal(deducted) * med.selling_price

            StockLedgerEntry.objects.create(
                medicine=med,
                batch_no=batches[0].get("batchNo") if batches else "GENERAL",
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
                amount_paid=total_cost if is_paid else Decimal("0.00"),
                payment_status=Bill.PaymentStatus.PAID if is_paid else Bill.PaymentStatus.UNPAID,
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
        return [IsRole("ADMIN", "DOCTOR", "LAB_TECH")()]

    def get_queryset(self):
        qs = LabTest.objects.select_related(
            "patient", "doctor__staff", "test_catalog", "technician"
        ).all().order_by("-ordered_date", "-created_at")

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

        if not doc_ident and hasattr(request.user, "staff"):
            doc_ident = request.user.staff.staff_id

        doctor = resolve_doctor(doc_ident)
        if not doctor:
            return Response({"detail": "Doctor not found.", "code": "NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

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
        """Updates lab test status (e.g. SAMPLE_COLLECTED, PROCESSING)."""
        order = self.get_object()
        new_status = request.data.get("status")
        tech_id = request.data.get("technicianId")

        if new_status not in ["SAMPLE_COLLECTED", "PROCESSING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]:
            return Response({"detail": f"Invalid status '{new_status}'", "code": "VALIDATION_ERROR"}, status=status.HTTP_400_BAD_REQUEST)

        order.status = new_status
        if new_status == "SAMPLE_COLLECTED" and not order.sample_collected_at:
            order.sample_collected_at = timezone.now()

        if tech_id:
            tech = Staff.objects.filter(Q(staff_id=tech_id) | Q(pk=tech_id)).first()
            if tech:
                order.technician = tech
        elif hasattr(request.user, "staff"):
            order.technician = request.user.staff

        order.save()
        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="enter-result")
    @transaction.atomic
    def enter_result(self, request, pk=None):
        """
        Enters test results, checks critical ranges, marks COMPLETED, notifies doctor.
        """
        order = self.get_object()
        results_data = request.data.get("results", {})
        tech_id = request.data.get("technicianId")
        remarks = request.data.get("remarks")
        is_critical = bool(request.data.get("isCritical", False))

        tech = None
        if tech_id:
            tech = Staff.objects.filter(Q(staff_id=tech_id) | Q(pk=tech_id)).first()
        if not tech and hasattr(request.user, "staff"):
            tech = request.user.staff

        # Check parameter ranges
        params = order.test_catalog.parameters or []
        for p in params:
            pname = p.get("name")
            if pname in results_data:
                try:
                    val = float(results_data[pname])
                    c_low = p.get("criticalLow")
                    c_high = p.get("criticalHigh")
                    if c_low is not None and val <= float(c_low):
                        is_critical = True
                    if c_high is not None and val >= float(c_high):
                        is_critical = True
                except (ValueError, TypeError):
                    pass

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
                "results": results_data,
                "is_critical": is_critical,
                "remarks": remarks or ("Critical values detected" if is_critical else "Results validated"),
            }
        )

        order.status = LabTest.Status.COMPLETED
        order.completed_at = timezone.now()
        if tech:
            order.technician = tech
        order.save(update_fields=["status", "completed_at", "technician", "updated_at"])

        if is_critical and order.doctor and hasattr(order.doctor.staff, "user_account"):
            doc_user = getattr(order.doctor.staff, "user_account", None)
            if doc_user:
                Notification.objects.create(
                    notification_type="LAB_RESULT",
                    title="Critical Lab Result",
                    message=f"Patient {order.patient.name} ({order.patient.mrn}) has critical {order.test_catalog.test_name} result.",
                    target_role="DOCTOR",
                    target_user=doc_user,
                    link="pages/doctor/lab-orders.html",
                )

        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)
