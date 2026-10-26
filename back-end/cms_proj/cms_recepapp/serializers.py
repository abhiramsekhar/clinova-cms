"""
cms_recepapp/serializers.py
DRF serializers for Receptionist domain models:
- Patient
- Appointment
- Bill & BillItem
- Payment

All monetary amounts are transmitted over the wire as integer paise (1 INR = 100 paise).
Doctor identifiers over the wire match Staff.staff_id (e.g. staff-doc-01).
"""

import datetime
import re
import unicodedata
from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from cms_doctorapp.models import Doctor
from cms_backendapp.models import Staff, Department
from .models import Patient, Appointment, Bill, BillItem, Payment
from .services import resolve_doctor


class GenderField(serializers.CharField):
    def to_representation(self, value):
        if value in ["M", "Male"]:
            return "Male"
        elif value in ["F", "Female"]:
            return "Female"
        return "Others" if value in ["Other", "Others"] else (value or "")

    def to_internal_value(self, data):
        val = str(data).strip().lower() if data else ""
        if val in ["male", "m"]:
            return "M"
        elif val in ["female", "f"]:
            return "F"
        elif val in ["other", "others"]:
            return "Other"
        raise serializers.ValidationError("Select Male, Female, or Others.")


class PatientSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="patient_id", read_only=True)
    dateOfBirth = serializers.DateField(source="dob", required=False, allow_null=True)
    gender = GenderField(required=False, allow_null=False, allow_blank=False)
    name = serializers.CharField(required=False, allow_blank=False, max_length=100, trim_whitespace=False)
    phone = serializers.CharField(required=False, allow_blank=False, max_length=20, trim_whitespace=False)
    address = serializers.CharField(required=False, allow_blank=False, max_length=500, trim_whitespace=True)
    bloodGroup = serializers.CharField(source="blood_group", required=False, allow_null=True, allow_blank=True)
    chronicConditions = serializers.JSONField(source="chronic_conditions", required=False)
    emergencyContact = serializers.CharField(source="emergency_contact", required=False, allow_null=True, allow_blank=True)
    guardianName = serializers.CharField(source="guardian_name", required=False, allow_null=True, allow_blank=True)
    guardianPhone = serializers.CharField(source="guardian_phone", required=False, allow_null=True, allow_blank=True)
    isActive = serializers.BooleanField(source="is_active", default=True, required=False)
    registeredOn = serializers.DateField(source="registered_on", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    allergies = serializers.SerializerMethodField()
    assignedDoctorId = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    assignedDoctor = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Patient
        fields = [
            "id",
            "mrn",
            "name",
            "dateOfBirth",
            "gender",
            "phone",
            "email",
            "address",
            "bloodGroup",
            "allergies",
            "chronicConditions",
            "emergencyContact",
            "guardianName",
            "guardianPhone",
            "assignedDoctorId",
            "assignedDoctor",
            "isActive",
            "registeredOn",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "mrn", "registeredOn", "createdAt", "updatedAt"]

    def get_allergies(self, obj):
        if not obj.allergies:
            return []
        if isinstance(obj.allergies, list):
            return obj.allergies
        # Split comma-separated string
        return [item.strip() for item in obj.allergies.split(",") if item.strip()]

    def get_assignedDoctor(self, obj):
        if not obj.assigned_doctor or not obj.assigned_doctor.staff:
            return None
        return {
            "id": obj.assigned_doctor.staff.staff_id,
            "name": obj.assigned_doctor.staff.name,
        }

    def validate_bloodGroup(self, value):
        allowed = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
        if value and value not in allowed:
            raise serializers.ValidationError("Select a valid blood group.")
        return value

    def validate(self, attrs):
        dob = attrs.get("dob", getattr(self.instance, "dob", None))
        name = attrs.get("name", "")
        phone = attrs.get("phone", getattr(self.instance, "phone", None))
        address = attrs.get("address", getattr(self.instance, "address", None))
        gender = attrs.get("gender", getattr(self.instance, "gender", None))

        if not self.instance:
            required = {
                "name": name,
                "phone": phone,
                "dateOfBirth": dob,
                "gender": gender,
                "address": address,
            }
            missing = {key: "This field is required." for key, value in required.items() if not value}
            if missing:
                raise serializers.ValidationError(missing)

        if "name" in attrs:
            raw_name = self.initial_data.get("name")
            if not isinstance(raw_name, str) or not raw_name:
                raise serializers.ValidationError({"name": "Patient name must be text."})
            parts = raw_name.split(" ")
            valid_parts = all(part and part[0].isalpha() and all(char.isalpha() or unicodedata.category(char).startswith("M") for char in part) for part in parts)
            if not valid_parts:
                raise serializers.ValidationError({"name": "Use only letters with single spaces, without leading or trailing spaces."})
            if sum(char.isalpha() for char in raw_name) < 3 or not any(sum(char.isalpha() for char in part) >= 2 for part in parts):
                raise serializers.ValidationError({"name": "Use at least 3 letters and a proper name, not only single-letter initials."})
            attrs["name"] = raw_name.strip()

        if "phone" in attrs:
            raw_phone = self.initial_data.get("phone")
            if not isinstance(raw_phone, str) or not re.fullmatch(r"[6-9][0-9]{9}", raw_phone):
                raise serializers.ValidationError({"phone": "Enter exactly 10 digits, starting with 6, 7, 8, or 9, without spaces."})
            attrs["phone"] = raw_phone

        if "dob" in attrs and attrs["dob"] is None:
            raise serializers.ValidationError({"dateOfBirth": "Date of birth is required."})
        if "dob" in attrs and not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", str(self.initial_data.get("dateOfBirth", ""))):
            raise serializers.ValidationError({"dateOfBirth": "Enter a complete date in YYYY-MM-DD format."})

        if address is not None:
            address = str(address).strip()
            if not address:
                raise serializers.ValidationError({"address": "Address is required."})
            if len(address) > 500:
                raise serializers.ValidationError({"address": "Address must be at most 500 characters."})
            attrs["address"] = address

        gender = {"Male": "M", "Female": "F", "Others": "Other"}.get(gender, gender)
        if gender not in ["M", "F", "Other"]:
            raise serializers.ValidationError({"gender": "Select Male, Female, or Others."})

        if "allergies" in self.initial_data:
            raw = self.initial_data["allergies"]
            if raw is None or raw == "":
                entries = []
            elif isinstance(raw, str):
                entries = raw.split(",")
            elif isinstance(raw, list):
                entries = raw
            else:
                raise serializers.ValidationError({"allergies": "Allergies must be text or a list of text entries."})
            if any(not isinstance(entry, str) or not entry.strip() for entry in entries):
                raise serializers.ValidationError({"allergies": "Allergy entries cannot be blank or whitespace-only."})
            entries = [entry.strip() for entry in entries]
            if len(entries) > 20 or any(len(entry) > 100 for entry in entries) or len(", ".join(entries)) > 1000:
                raise serializers.ValidationError({"allergies": "Use at most 20 allergies, 100 characters each and 1000 characters total."})
            attrs["allergies"] = ", ".join(entries)

        # Under 18 guardian check
        if dob:
            today = timezone.localdate()
            if dob > today:
                raise serializers.ValidationError({"dateOfBirth": "Date of birth cannot be in the future."})
            if dob < datetime.date(1900, 1, 1):
                raise serializers.ValidationError({"dateOfBirth": "Date of birth must be in 1900 or later."})

            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            g_name = attrs.get("guardian_name", getattr(self.instance, "guardian_name", None))
            g_phone = attrs.get("guardian_phone", getattr(self.instance, "guardian_phone", None))
            if age < 18 and (not g_name or not g_phone):
                raise serializers.ValidationError(
                    {"detail": "Patients under 18 require guardian details.", "code": "VALIDATION_ERROR"}
                )
            if age < 18 and sum(char.isalpha() for char in str(g_name)) < 2:
                raise serializers.ValidationError({"guardianName": "Guardian name must contain at least two letters."})
            if age < 18 and not re.fullmatch(r"[6-9][0-9]{9}", str(g_phone)):
                raise serializers.ValidationError({"guardianPhone": "Guardian phone must be exactly 10 digits and start with 6, 7, 8, or 9."})

        return attrs

    def create(self, validated_data):
        doc_ident = self.initial_data.get("assignedDoctorId")
        if doc_ident:
            validated_data["assigned_doctor"] = resolve_doctor(doc_ident)

        # Auto-generate MRN: CLN-YYYY-XXXX
        year = timezone.localdate().year
        existing_mrns = Patient.objects.filter(mrn__startswith=f"CLN-{year}-").values_list("mrn", flat=True)
        max_seq = 0
        for m in existing_mrns:
            try:
                parts = m.split("-")
                if len(parts) == 3 and parts[2].isdigit():
                    max_seq = max(max_seq, int(parts[2]))
            except Exception:
                pass
        validated_data["mrn"] = f"CLN-{year}-{str(max_seq + 1).zfill(4)}"

        # Sequential pat-XX id if not provided
        if "patient_id" not in validated_data:
            existing_pids = Patient.objects.filter(patient_id__startswith="pat-").values_list("patient_id", flat=True)
            max_num = 0
            for pid in existing_pids:
                try:
                    num = int(pid.split("-")[1])
                    if num > max_num:
                        max_num = num
                except Exception:
                    pass
            validated_data["patient_id"] = f"pat-{str(max_num + 1).zfill(2)}"

        if "registered_on" not in validated_data:
            validated_data["registered_on"] = timezone.localdate()

        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "assignedDoctorId" in self.initial_data:
            doc_ident = self.initial_data.get("assignedDoctorId")
            validated_data["assigned_doctor"] = resolve_doctor(doc_ident) if doc_ident else None

        return super().update(instance, validated_data)


class AppointmentSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="appointment_id", read_only=True)
    patientId = serializers.CharField(write_only=True, required=False)
    doctorId = serializers.CharField(write_only=True, required=False)
    departmentId = serializers.CharField(write_only=True, required=False, allow_null=True)

    patient = serializers.SerializerMethodField(read_only=True)
    doctor = serializers.SerializerMethodField(read_only=True)
    department = serializers.SerializerMethodField(read_only=True)

    date = serializers.DateField(source="appointment_date")
    time = serializers.CharField(source="time_slot")
    bookingMode = serializers.CharField(source="booking_mode", read_only=True)
    type = serializers.CharField(source="appointment_type", default="New Visit")
    # Tokens are confirmed by walk-in payment or prior reporting after payment.
    tokenNumber = serializers.IntegerField(source="token_number", read_only=True, allow_null=True)
    billId = serializers.SerializerMethodField()
    billStatus = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "id",
            "patientId",
            "patient",
            "doctorId",
            "doctor",
            "departmentId",
            "department",
            "date",
            "time",
            "bookingMode",
            "type",
            "status",
            "reason",
            "notes",
            "tokenNumber",
            "billId",
            "billStatus",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "status", "createdAt", "updatedAt"]

    def get_patient(self, obj):
        if not obj.patient:
            return None
        return {
            "id": obj.patient.patient_id,
            "name": obj.patient.name,
            "mrn": obj.patient.mrn,
            "phone": obj.patient.phone,
        }

    def get_doctor(self, obj):
        if not obj.doctor or not obj.doctor.staff:
            return None
        return {
            "id": obj.doctor.staff.staff_id,
            "name": obj.doctor.staff.name,
            "departmentId": obj.department_id or (obj.doctor.department_id if obj.doctor.department else None),
        }

    def get_department(self, obj):
        dept = obj.department or (obj.doctor.department if obj.doctor else None)
        if not dept:
            return None
        return {
            "id": dept.department_id,
            "name": dept.name,
        }

    def appointment_bill(self, obj):
        bill = obj.bills.first()
        if bill is None:
            from cms_backendapp.models import AuditLog
            from .models import Bill
            reassignment = AuditLog.objects.filter(action="LATE_ARRIVAL_REASSIGNED", details__replacementId=obj.pk).first()
            if reassignment:
                bill = Bill.objects.filter(pk=reassignment.details["billId"]).first()
        return bill

    def get_billId(self, obj):
        bill = self.appointment_bill(obj)
        return bill.bill_id if bill else None

    def get_billStatus(self, obj):
        bill = self.appointment_bill(obj)
        return bill.payment_status if bill else None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        if instance.booking_mode == Appointment.BookingMode.PRIOR:
            from .services import reporting_window
            opening, deadline = reporting_window(instance)
            ret["reportingStartsAt"] = opening.isoformat()
            ret["reportingDeadlineAt"] = deadline.isoformat()
            from cms_backendapp.models import AuditLog
            reassignment = AuditLog.objects.filter(action="LATE_ARRIVAL_REASSIGNED", entity_type="APPOINTMENT", entity_id=instance.pk).first()
            ret["replacementAppointmentId"] = reassignment.details.get("replacementId") if reassignment else None
            ret["lateArrivalHandled"] = instance.status == Appointment.Status.REBOOKED or bool(reassignment)
        ret["tokenConfirmed"] = instance.token_number is not None and instance.status in [
            Appointment.Status.CHECKED_IN, Appointment.Status.IN_PROGRESS, Appointment.Status.COMPLETED]
        # Convenience flat fields for frontend compatibility
        if instance.patient:
            ret["patientId"] = instance.patient.patient_id
            ret["patientName"] = instance.patient.name
            ret["patientMrn"] = instance.patient.mrn
        if instance.doctor and instance.doctor.staff:
            ret["doctorId"] = instance.doctor.staff.staff_id
            ret["doctorName"] = instance.doctor.staff.name
        if instance.department:
            ret["departmentId"] = instance.department.department_id
            ret["departmentName"] = instance.department.name
        return ret

    def validate(self, attrs):
        data = self.initial_data
        patient_id = data.get("patientId")
        if patient_id:
            patient = Patient.objects.filter(pk=patient_id).first()
            if not patient:
                raise serializers.ValidationError({"patientId": f"Patient '{patient_id}' not found."})
            if not patient.is_active:
                raise serializers.ValidationError({"patientId": "This patient record is inactive."})
            attrs["patient"] = patient

        doc_ident = data.get("doctorId")
        if doc_ident:
            doctor = resolve_doctor(doc_ident)
            if not doctor:
                raise serializers.ValidationError({"doctorId": f"Doctor '{doc_ident}' not found."})
            if not doctor.staff.is_active:
                raise serializers.ValidationError({"doctorId": "The selected doctor is not available."})
            attrs["doctor"] = doctor
            if not attrs.get("department"):
                attrs["department"] = doctor.department or doctor.staff.department

        dept_id = data.get("departmentId")
        if dept_id:
            dept = Department.objects.filter(pk=dept_id).first()
            if dept:
                attrs["department"] = dept

        # Double-booking check (same doctor + date + time_slot, status SCHEDULED/COMPLETED/CHECKED_IN/IN_PROGRESS)
        doc = attrs.get("doctor") or (self.instance.doctor if self.instance else None)
        adate = attrs.get("appointment_date") or (self.instance.appointment_date if self.instance else None)
        aslot = attrs.get("time_slot") or (self.instance.time_slot if self.instance else None)
        if doc and adate and aslot:
            conflict_qs = Appointment.objects.select_for_update().filter(
                doctor=doc,
                appointment_date=adate,
                time_slot=aslot,
                status__in=[
                    Appointment.Status.SCHEDULED,
                    Appointment.Status.CHECKED_IN,
                    Appointment.Status.IN_PROGRESS,
                    Appointment.Status.COMPLETED,
                ],
            )
            if self.instance:
                conflict_qs = conflict_qs.exclude(pk=self.instance.pk)
            if conflict_qs.exists():
                raise serializers.ValidationError(
                    {"time": "This time slot is already booked for the selected doctor.", "detail": "This time slot is already booked for the selected doctor."}
                )

        return attrs

    def create(self, validated_data):
        if "appointment_id" not in validated_data:
            existing_appts = Appointment.objects.filter(appointment_id__startswith="appt-").values_list("appointment_id", flat=True)
            max_num = 0
            for aid in existing_appts:
                try:
                    num = int(aid.split("-")[1])
                    if num > max_num:
                        max_num = num
                except Exception:
                    pass
            validated_data["appointment_id"] = f"appt-{str(max_num + 1).zfill(3)}"

        return super().create(validated_data)


class BillItemSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="bill_item_id", read_only=True)
    billId = serializers.CharField(source="bill.bill_id", read_only=True)
    type = serializers.CharField(source="item_type", required=False)
    itemType = serializers.CharField(source="item_type", required=False)
    sourceId = serializers.CharField(source="source_id", required=False, allow_null=True, allow_blank=True)
    referenceId = serializers.CharField(source="source_id", write_only=True, required=False, allow_null=True, allow_blank=True)
    amount = serializers.IntegerField()  # In integer paise

    class Meta:
        model = BillItem
        fields = [
            "id",
            "billId",
            "type",
            "itemType",
            "description",
            "amount",
            "sourceId",
            "referenceId",
        ]
        read_only_fields = ["id", "billId"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Outbound money: convert Decimal to integer paise
        ret["amount"] = int(round(float(instance.amount) * 100))
        ret["type"] = instance.item_type.lower()
        return ret

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        # Inbound money: convert integer paise to Decimal
        if "amount" in ret:
            ret["amount"] = Decimal(ret["amount"]) / Decimal("100")
        if "source_id" not in ret and "referenceId" in data:
            ret["source_id"] = data["referenceId"]
        if "item_type" in ret:
            ret["item_type"] = ret["item_type"].upper()
        return ret


class PaymentSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="payment_id", read_only=True)
    billId = serializers.CharField(source="bill.bill_id", read_only=True)
    amount = serializers.IntegerField(source="amount_paid")  # In integer paise
    paymentDate = serializers.DateField(source="payment_date")
    method = serializers.CharField(source="payment_method")
    paymentMethod = serializers.CharField(source="payment_method", read_only=True)
    transactionRef = serializers.CharField(source="transaction_ref", required=False, allow_null=True, allow_blank=True)
    receivedBy = serializers.CharField(source="received_by.staff_id", read_only=True, allow_null=True)
    receivedByName = serializers.CharField(source="received_by.name", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "billId",
            "amount",
            "paymentDate",
            "method",
            "paymentMethod",
            "transactionRef",
            "receivedBy",
            "receivedByName",
            "createdAt",
        ]
        read_only_fields = ["id", "billId", "createdAt", "receivedBy", "receivedByName"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Outbound money: convert Decimal to integer paise
        ret["amount"] = int(round(float(instance.amount_paid) * 100))
        return ret

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "amount_paid" in ret:
            ret["amount_paid"] = Decimal(ret["amount_paid"]) / Decimal("100")
        return ret


class BillSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="bill_id", read_only=True)
    patientId = serializers.CharField(source="patient.patient_id", read_only=True)
    patientName = serializers.CharField(source="patient.name", read_only=True)
    patientMrn = serializers.CharField(source="patient.mrn", read_only=True)
    appointmentId = serializers.CharField(source="appointment.appointment_id", read_only=True, allow_null=True)
    appointmentDate = serializers.SerializerMethodField()
    appointmentTime = serializers.SerializerMethodField()
    bookingMode = serializers.SerializerMethodField()
    doctorName = serializers.SerializerMethodField()
    departmentName = serializers.SerializerMethodField()
    billDate = serializers.DateField(source="bill_date")
    totalAmount = serializers.SerializerMethodField()
    paidAmount = serializers.SerializerMethodField()
    balanceDue = serializers.SerializerMethodField()
    status = serializers.CharField(source="payment_status")
    items = BillItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    generatedBy = serializers.CharField(source="generated_by.staff_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Bill
        fields = [
            "id",
            "patientId",
            "patientName",
            "patientMrn",
            "appointmentId",
            "appointmentDate",
            "appointmentTime",
            "bookingMode",
            "doctorName",
            "departmentName",
            "billDate",
            "totalAmount",
            "paidAmount",
            "balanceDue",
            "status",
            "items",
            "payments",
            "generatedBy",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = [
            "id",
            "patientId",
            "patientName",
            "patientMrn",
            "appointmentId",
            "totalAmount",
            "paidAmount",
            "balanceDue",
            "generatedBy",
            "createdAt",
            "updatedAt",
        ]

    def get_totalAmount(self, obj):
        return int(round(float(obj.total_amount) * 100))

    def get_appointmentDate(self, obj):
        return obj.appointment.appointment_date if obj.appointment_id else None

    def get_appointmentTime(self, obj):
        return obj.appointment.time_slot if obj.appointment_id else None

    def get_bookingMode(self, obj):
        return obj.appointment.booking_mode if obj.appointment_id else None

    def get_doctorName(self, obj):
        appointment = obj.appointment
        return appointment.doctor.staff.name if appointment and appointment.doctor_id and appointment.doctor.staff_id else None

    def get_departmentName(self, obj):
        appointment = obj.appointment
        department = (appointment.department or appointment.doctor.department) if appointment and appointment.doctor_id else None
        return department.name if department else None

    def get_paidAmount(self, obj):
        return int(round(float(obj.amount_paid) * 100))

    def get_balanceDue(self, obj):
        return int(round(float(obj.balance_due) * 100))
