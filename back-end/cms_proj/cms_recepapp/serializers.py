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
        return value or "Other"

    def to_internal_value(self, data):
        val = str(data).strip().capitalize() if data else ""
        if val in ["Male", "M"]:
            return "M"
        elif val in ["Female", "F"]:
            return "F"
        return "Other"


class PatientSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="patient_id", read_only=True)
    dateOfBirth = serializers.DateField(source="dob", required=False, allow_null=True)
    gender = GenderField(required=False, allow_null=True, allow_blank=True)
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

    def validate(self, attrs):
        data = self.initial_data
        dob = attrs.get("dob")
        name = (attrs.get("name") or "").strip()

        if not name and not self.instance:
            raise serializers.ValidationError({"name": "Patient name is required."})

        # Under 18 guardian check
        if dob:
            today = datetime.date.today()
            if dob > today:
                raise serializers.ValidationError({"dateOfBirth": "Date of birth cannot be in the future."})

            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            g_name = attrs.get("guardian_name", getattr(self.instance, "guardian_name", None))
            g_phone = attrs.get("guardian_phone", getattr(self.instance, "guardian_phone", None))
            if age < 18 and (not g_name or not g_phone):
                raise serializers.ValidationError(
                    {"detail": "Patients under 18 require guardian details.", "code": "VALIDATION_ERROR"}
                )

        # Duplicate check on creation
        if not self.instance:
            phone = attrs.get("phone")
            existing = Patient.objects.filter(is_active=True)
            if dob and existing.filter(name__iexact=name, dob=dob).exists():
                raise serializers.ValidationError(
                    {"detail": "This patient is already registered (same name and date of birth).", "code": "DUPLICATE_PATIENT"}
                )
            if phone and existing.filter(name__iexact=name, phone=phone).exists():
                raise serializers.ValidationError(
                    {"detail": "This patient is already registered (same name and phone).", "code": "DUPLICATE_PATIENT"}
                )

        return attrs

    def create(self, validated_data):
        raw_allergies = self.initial_data.get("allergies")
        if isinstance(raw_allergies, list):
            validated_data["allergies"] = ", ".join(str(a) for a in raw_allergies)
        elif isinstance(raw_allergies, str):
            validated_data["allergies"] = raw_allergies

        doc_ident = self.initial_data.get("assignedDoctorId")
        if doc_ident:
            validated_data["assigned_doctor"] = resolve_doctor(doc_ident)

        # Auto-generate MRN: CLN-YYYY-XXXX
        year = datetime.date.today().year
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
            validated_data["registered_on"] = datetime.date.today()

        return super().create(validated_data)

    def update(self, instance, validated_data):
        raw_allergies = self.initial_data.get("allergies")
        if raw_allergies is not None:
            if isinstance(raw_allergies, list):
                validated_data["allergies"] = ", ".join(str(a) for a in raw_allergies)
            else:
                validated_data["allergies"] = str(raw_allergies)

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
    type = serializers.CharField(source="appointment_type", default="New Visit")
    tokenNumber = serializers.IntegerField(source="token_number", required=False, allow_null=True)
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
        read_only_fields = ["id", "createdAt", "updatedAt"]

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

    def get_billId(self, obj):
        first_bill = obj.bills.first()
        return first_bill.bill_id if first_bill else None

    def get_billStatus(self, obj):
        first_bill = obj.bills.first()
        return first_bill.payment_status if first_bill else None

    def to_representation(self, instance):
        ret = super().to_representation(instance)
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

    def get_paidAmount(self, obj):
        return int(round(float(obj.amount_paid) * 100))

    def get_balanceDue(self, obj):
        return int(round(float(obj.balance_due) * 100))
