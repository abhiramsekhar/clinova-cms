"""
receptionist_app/models.py
Receptionist's own module: FR-REC-01 to FR-REC-07.
Owns: Patient, Appointment, Bill, BillItem, Payment.
"""

from django.db import models, transaction
from django.core.validators import MinValueValidator

from cms_backendapp.models import generate_prefixed_id


class Patient(models.Model):
    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "Other", "Other"

    patient_id = models.CharField(max_length=15, primary_key=True)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True, null=True)
    email = models.EmailField(max_length=100, blank=True, null=True)
    dob = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True, null=True)
    blood_group = models.CharField(max_length=5, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    emergency_contact = models.CharField(max_length=15, blank=True, null=True)
    allergies = models.TextField(blank=True, null=True)
    assigned_doctor = models.ForeignKey(
        "cms_doctorapp.Doctor", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="patients",
    )
    registered_on = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)  # soft-delete flag
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patients"
        indexes = [
            models.Index(fields=["assigned_doctor"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return self.name

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.patient_id:
            self.patient_id = generate_prefixed_id("PATIENT", "PAT", with_year=True)
        super().save(*args, **kwargs)


class Appointment(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    appointment_id = models.CharField(max_length=15, primary_key=True)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="appointments")
    doctor = models.ForeignKey(
        "cms_doctorapp.Doctor", on_delete=models.PROTECT, related_name="appointments"
    )
    appointment_date = models.DateField()
    time_slot = models.CharField(max_length=20)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SCHEDULED)
    created_by = models.ForeignKey(
        "cms_backendapp.Staff", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="appointments_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "appointments"
        indexes = [
            models.Index(fields=["doctor", "appointment_date"]),
            models.Index(fields=["patient"]),
        ]
        constraints = [
            # Same effect as the generated booking_key + unique index in the
            # SQL version: a doctor can't be double-booked for the same slot
            # unless the earlier appointment was cancelled.
            models.UniqueConstraint(
                fields=["doctor", "appointment_date", "time_slot"],
                condition=models.Q(status__in=["SCHEDULED", "COMPLETED"]),
                name="uq_appt_active_slot",
            ),
        ]

    def __str__(self):
        return f"{self.patient} with {self.doctor_id} on {self.appointment_date} {self.time_slot}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.appointment_id:
            self.appointment_id = generate_prefixed_id("APPOINTMENT", "APT")
        super().save(*args, **kwargs)


class Bill(models.Model):
    class PaymentStatus(models.TextChoices):
        UNPAID = "UNPAID", "Unpaid"
        PARTIAL = "PARTIAL", "Partial"
        PAID = "PAID", "Paid"

    bill_id = models.CharField(max_length=15, primary_key=True)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="bills")
    appointment = models.ForeignKey(
        Appointment, on_delete=models.SET_NULL, null=True, blank=True, related_name="bills"
    )
    bill_date = models.DateField()
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                        validators=[MinValueValidator(0)])
    # Cache kept in sync by Payment.save() below — never set this directly elsewhere.
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                       validators=[MinValueValidator(0)])
    payment_status = models.CharField(max_length=10, choices=PaymentStatus.choices,
                                       default=PaymentStatus.UNPAID)
    generated_by = models.ForeignKey(
        "cms_backendapp.Staff", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="bills_generated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bills"
        indexes = [
            models.Index(fields=["patient"]),
            models.Index(fields=["payment_status"]),
        ]

    def __str__(self):
        return f"Bill {self.bill_id} — {self.patient}"

    @property
    def balance_due(self):
        """Derived, not stored — equivalent to the generated column in the SQL schema."""
        return self.total_amount - self.amount_paid

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.bill_id:
            self.bill_id = generate_prefixed_id("BILL", "BIL")
        super().save(*args, **kwargs)


class BillItem(models.Model):
    class ItemType(models.TextChoices):
        CONSULTATION = "CONSULTATION", "Consultation"
        MEDICINE = "MEDICINE", "Medicine"
        LAB_TEST = "LAB_TEST", "Lab test"
        OTHER = "OTHER", "Other"

    bill_item_id = models.CharField(max_length=15, primary_key=True)
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="items")
    item_type = models.CharField(max_length=15, choices=ItemType.choices, default=ItemType.OTHER)
    # Traces this charge back to its origin record — a PrescriptionItem.item_id,
    # a LabTest.test_id, etc. Kept as a plain CharField (not an FK) since it can
    # point at rows in different tables/apps depending on item_type.
    source_id = models.CharField(max_length=15, blank=True, null=True)
    description = models.CharField(max_length=200)  # e.g. "Consultation Fee", "Medicine - X"
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                  validators=[MinValueValidator(0)])

    class Meta:
        db_table = "bill_items"
        indexes = [models.Index(fields=["bill"])]

    def __str__(self):
        return f"{self.description} ({self.amount})"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.bill_item_id:
            self.bill_item_id = generate_prefixed_id("BILL_ITEM", "BLI")
        super().save(*args, **kwargs)


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        UPI = "UPI", "UPI"
        OTHER = "OTHER", "Other"

    payment_id = models.CharField(max_length=15, primary_key=True)
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="payments")
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2,
                                       validators=[MinValueValidator(0.01)])
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=10, choices=Method.choices, default=Method.CASH)
    received_by = models.ForeignKey(
        "cms_backendapp.Staff", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="payments_received",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "payments"
        indexes = [models.Index(fields=["bill"])]

    def __str__(self):
        return f"Payment {self.payment_id} for {self.bill_id}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        if not self.payment_id:
            self.payment_id = generate_prefixed_id("PAYMENT", "PAY")
        super().save(*args, **kwargs)

        if is_new:
            # Reproduces trg_payments_after_insert from the SQL schema: keep
            # Bill.amount_paid / payment_status in sync automatically.
            bill = Bill.objects.select_for_update().get(pk=self.bill_id)
            bill.amount_paid = bill.amount_paid + self.amount_paid
            if bill.amount_paid >= bill.total_amount:
                bill.payment_status = Bill.PaymentStatus.PAID
            elif bill.amount_paid > 0:
                bill.payment_status = Bill.PaymentStatus.PARTIAL
            else:
                bill.payment_status = Bill.PaymentStatus.UNPAID
            bill.save(update_fields=["amount_paid", "payment_status", "updated_at"])