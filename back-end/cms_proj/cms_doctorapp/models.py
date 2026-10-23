"""
doctor_app/models.py
Doctor's own module: FR-DOC-01 to FR-DOC-06.
Owns: Doctor, ConsultationRecord, Prescription, PrescriptionItem, LabTest
(the lab test *order* — the result belongs to labtech_app).
"""

from django.db import models, transaction
from django.core.validators import MinValueValidator

from cms_backendapp.models import generate_prefixed_id


class Doctor(models.Model):
    """1:1 extension of cms_backendapp.Staff — doctor-only fields."""
    doctor_id = models.CharField(max_length=15, primary_key=True)
    staff = models.OneToOneField(
        "cms_backendapp.Staff", on_delete=models.PROTECT, related_name="doctor_profile"
    )
    specialization = models.CharField(max_length=100, blank=True, null=True)
    qualification = models.CharField(max_length=100, blank=True, null=True)
    license_number = models.CharField(max_length=50, blank=True, null=True)
    department = models.ForeignKey(
        "cms_backendapp.Department", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="doctors",
    )
    consultation_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                            validators=[MinValueValidator(0)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "doctors"
        indexes = [models.Index(fields=["department"])]

    def __str__(self):
        return f"Dr. {self.staff.name}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.doctor_id:
            self.doctor_id = generate_prefixed_id("DOCTOR", "DOC")
        super().save(*args, **kwargs)


class ConsultationRecord(models.Model):
    record_id = models.CharField(max_length=15, primary_key=True)
    patient = models.ForeignKey(
        "cms_recepapp.Patient", on_delete=models.PROTECT, related_name="consultation_records"
    )
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name="consultation_records")
    appointment = models.ForeignKey(
        "cms_recepapp.Appointment", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="consultation_records",
    )
    visit_date = models.DateField()
    diagnosis = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "consultation_records"
        indexes = [
            models.Index(fields=["patient"]),
            models.Index(fields=["doctor"]),
        ]

    def __str__(self):
        return f"Consultation {self.record_id} — {self.patient_id}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.record_id:
            self.record_id = generate_prefixed_id("CONSULTATION", "CON")
        super().save(*args, **kwargs)


class Prescription(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DISPENSED = "DISPENSED", "Dispensed"
        CANCELLED = "CANCELLED", "Cancelled"

    prescription_id = models.CharField(max_length=15, primary_key=True)
    patient = models.ForeignKey(
        "cms_recepapp.Patient", on_delete=models.PROTECT, related_name="prescriptions"
    )
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name="prescriptions")
    appointment = models.ForeignKey(
        "cms_recepapp.Appointment", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="prescriptions",
    )
    date_issued = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "prescriptions"
        indexes = [
            models.Index(fields=["patient"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"Prescription {self.prescription_id} — {self.patient_id}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.prescription_id:
            self.prescription_id = generate_prefixed_id("PRESCRIPTION", "RX")
        super().save(*args, **kwargs)


class PrescriptionItem(models.Model):
    item_id = models.CharField(max_length=15, primary_key=True)
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="items")
    medicine = models.ForeignKey(
        "cms_pharmapp.Medicine", on_delete=models.PROTECT, related_name="prescription_items"
    )
    dosage = models.CharField(max_length=50, blank=True, null=True)  # e.g. 1-0-1
    duration_days = models.IntegerField(blank=True, null=True, validators=[MinValueValidator(1)])
    instructions = models.TextField(blank=True, null=True)  # e.g. after food

    class Meta:
        db_table = "prescription_items"
        indexes = [
            models.Index(fields=["prescription"]),
            models.Index(fields=["medicine"]),
        ]

    def __str__(self):
        return f"{self.medicine_id} x{self.prescription_id}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.item_id:
            self.item_id = generate_prefixed_id("PRESCRIPTION_ITEM", "RXI")
        super().save(*args, **kwargs)


class LabTest(models.Model):
    """The lab test *order* raised by a doctor. The result lives in cms_labapp.LabTestResult."""
    class Status(models.TextChoices):
        ORDERED = "ORDERED", "Ordered"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        COMPLETED = "COMPLETED", "Completed"

    test_id = models.CharField(max_length=15, primary_key=True)
    patient = models.ForeignKey(
        "cms_recepapp.Patient", on_delete=models.PROTECT, related_name="lab_tests"
    )
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name="lab_tests_ordered")
    appointment = models.ForeignKey(
        "cms_recepapp.Appointment", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="lab_tests",
    )
    test_catalog = models.ForeignKey(
        "cms_backendapp.LabTestCatalog", on_delete=models.PROTECT, related_name="lab_tests"
    )
    ordered_date = models.DateField()
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ORDERED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lab_tests"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["doctor"]),
            models.Index(fields=["patient"]),
        ]

    def __str__(self):
        return f"{self.test_catalog_id} for {self.patient_id}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.test_id:
            self.test_id = generate_prefixed_id("LAB_TEST", "LAB")
        super().save(*args, **kwargs)