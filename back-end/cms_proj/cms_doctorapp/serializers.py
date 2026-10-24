"""
cms_doctorapp/serializers.py
DRF serializers for Doctor domain:
- Doctor
- ConsultationRecord
- Prescription & PrescriptionItem
- LabOrder (LabTest)
"""

import datetime
from decimal import Decimal
from rest_framework import serializers
from django.db.models import Q

from cms_backendapp.models import Staff, Department, LabTestCatalog
from cms_recepapp.models import Patient, Appointment
from .models import Doctor, ConsultationRecord, Prescription, PrescriptionItem, LabTest


def resolve_doctor(ident):
    return Doctor.objects.filter(
        Q(staff__staff_id=ident) | Q(doctor_id=ident)
    ).select_related("staff", "department").first()


class DoctorSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="staff.staff_id", read_only=True)
    doctorId = serializers.CharField(source="doctor_id", read_only=True)
    name = serializers.CharField(source="staff.name", read_only=True)
    departmentId = serializers.CharField(source="department.department_id", read_only=True, allow_null=True)
    departmentName = serializers.CharField(source="department.name", read_only=True, allow_null=True)
    consultationFee = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source="staff.is_active", read_only=True)

    class Meta:
        model = Doctor
        fields = [
            "id",
            "doctorId",
            "name",
            "departmentId",
            "departmentName",
            "specialization",
            "qualification",
            "license_number",
            "consultationFee",
            "isActive",
        ]

    def get_consultationFee(self, obj):
        return int(round(float(obj.consultation_fee) * 100))


class ConsultationRecordSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="record_id", read_only=True)
    patientId = serializers.CharField(source="patient.patient_id", read_only=True)
    patientName = serializers.CharField(source="patient.name", read_only=True)
    patientMrn = serializers.CharField(source="patient.mrn", read_only=True)
    doctorId = serializers.CharField(source="doctor.staff.staff_id", read_only=True)
    doctorName = serializers.CharField(source="doctor.staff.name", read_only=True)
    appointmentId = serializers.CharField(source="appointment.appointment_id", read_only=True, allow_null=True)
    visitDate = serializers.DateField(source="visit_date", required=False)
    vitalSigns = serializers.JSONField(source="vital_signs", required=False)
    isCompleted = serializers.BooleanField(source="is_completed", default=False)
    addendums = serializers.JSONField(required=False)
    addendas = serializers.JSONField(source="addendums", required=False)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = ConsultationRecord
        fields = [
            "id",
            "patientId",
            "patientName",
            "patientMrn",
            "doctorId",
            "doctorName",
            "appointmentId",
            "visitDate",
            "symptoms",
            "diagnosis",
            "notes",
            "vitalSigns",
            "isCompleted",
            "addendums",
            "addendas",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]


class PrescriptionItemSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="item_id", read_only=True)
    medicineId = serializers.CharField(source="medicine.medicine_id")
    medicineName = serializers.CharField(source="medicine.name", read_only=True)
    genericName = serializers.CharField(source="medicine.generic_name", read_only=True)
    durationDays = serializers.IntegerField(source="duration_days", required=False, allow_null=True)

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "medicineId",
            "medicineName",
            "genericName",
            "dosage",
            "frequency",
            "durationDays",
            "instructions",
            "quantity",
        ]
        read_only_fields = ["id", "medicineName", "genericName"]


class PrescriptionSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="prescription_id", read_only=True)
    consultationId = serializers.CharField(source="consultation.record_id", read_only=True, allow_null=True)
    patientId = serializers.CharField(source="patient.patient_id", read_only=True)
    patientName = serializers.CharField(source="patient.name", read_only=True)
    patientAllergies = serializers.SerializerMethodField()
    doctorId = serializers.CharField(source="doctor.staff.staff_id", read_only=True)
    doctorName = serializers.CharField(source="doctor.staff.name", read_only=True)
    appointmentId = serializers.CharField(source="appointment.appointment_id", read_only=True, allow_null=True)
    dateIssued = serializers.DateField(source="date_issued", read_only=True)
    items = PrescriptionItemSerializer(many=True, read_only=True)
    dispensedBy = serializers.CharField(source="dispensed_by.staff_id", read_only=True, allow_null=True)
    dispensedByName = serializers.CharField(source="dispensed_by.name", read_only=True, allow_null=True)
    dispensedAt = serializers.DateTimeField(source="dispensed_at", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "id",
            "consultationId",
            "patientId",
            "patientName",
            "patientAllergies",
            "doctorId",
            "doctorName",
            "appointmentId",
            "dateIssued",
            "status",
            "notes",
            "items",
            "dispensedBy",
            "dispensedByName",
            "dispensedAt",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "dateIssued", "createdAt", "updatedAt"]

    def get_patientAllergies(self, obj):
        if not obj.patient or not obj.patient.allergies:
            return []
        if isinstance(obj.patient.allergies, list):
            return obj.patient.allergies
        return [a.strip() for a in obj.patient.allergies.split(",") if a.strip()]


class LabOrderSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="test_id", read_only=True)
    testId = serializers.CharField(source="test_catalog.test_catalog_id", read_only=True)
    testName = serializers.CharField(source="test_catalog.test_name", read_only=True)
    testCode = serializers.CharField(source="test_catalog.code", read_only=True)
    patientId = serializers.CharField(source="patient.patient_id", read_only=True)
    patientName = serializers.CharField(source="patient.name", read_only=True)
    patientMrn = serializers.CharField(source="patient.mrn", read_only=True)
    doctorId = serializers.CharField(source="doctor.staff.staff_id", read_only=True)
    doctorName = serializers.CharField(source="doctor.staff.name", read_only=True)
    appointmentId = serializers.CharField(source="appointment.appointment_id", read_only=True, allow_null=True)
    orderedDate = serializers.DateField(source="ordered_date", read_only=True)
    technicianId = serializers.CharField(source="technician.staff_id", read_only=True, allow_null=True)
    technicianName = serializers.CharField(source="technician.name", read_only=True, allow_null=True)
    sampleCollectedAt = serializers.DateTimeField(source="sample_collected_at", read_only=True, allow_null=True)
    completedAt = serializers.DateTimeField(source="completed_at", read_only=True, allow_null=True)
    results = serializers.SerializerMethodField()
    isCritical = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = LabTest
        fields = [
            "id",
            "testId",
            "testName",
            "testCode",
            "patientId",
            "patientName",
            "patientMrn",
            "doctorId",
            "doctorName",
            "appointmentId",
            "orderedDate",
            "status",
            "priority",
            "technicianId",
            "technicianName",
            "sampleCollectedAt",
            "completedAt",
            "notes",
            "results",
            "isCritical",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "orderedDate", "createdAt", "updatedAt"]

    def get_results(self, obj):
        res = getattr(obj, "result", None)
        if not res:
            res = obj.results.first() if hasattr(obj, "results") else None
        return res.results if res else None

    def get_isCritical(self, obj):
        res = getattr(obj, "result", None)
        if not res:
            res = obj.results.first() if hasattr(obj, "results") else None
        return res.is_critical if res else False
