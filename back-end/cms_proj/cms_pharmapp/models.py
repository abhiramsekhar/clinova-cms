"""
pharmacist_app/models.py
Pharmacist's own module: FR-PHM-01 to FR-PHM-05.
Owns: Medicine (inventory). Dispensing logic (marking a Prescription
DISPENSED, decrementing stock, writing a BillItem) lives in this app's
service layer and touches cms_doctorapp.Prescription / cms_recepapp.Bill
via their FKs — no new model needed for that here.
"""

from django.db import models, transaction
from django.core.validators import MinValueValidator

from cms_backendapp.models import generate_prefixed_id


class Medicine(models.Model):
    medicine_id = models.CharField(max_length=15, primary_key=True)
    name = models.CharField(max_length=100)
    generic_name = models.CharField(max_length=100, blank=True, null=True)
    manufacturer = models.CharField(max_length=100, blank=True, null=True)
    category = models.CharField(max_length=50, blank=True, null=True)  # tablet/syrup/injection...
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                      validators=[MinValueValidator(0)])
    selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                         validators=[MinValueValidator(0)])
    stock_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    reorder_threshold = models.IntegerField(default=10, validators=[MinValueValidator(0)])
    expiry_date = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "medicines"
        constraints = [
            models.UniqueConstraint(fields=["name", "manufacturer"], name="uq_medicine_name_mfr"),
        ]
        indexes = [
            models.Index(fields=["stock_quantity"]),
            models.Index(fields=["expiry_date"]),
        ]

    def __str__(self):
        return self.name

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.medicine_id:
            self.medicine_id = generate_prefixed_id("MEDICINE", "MED")
        super().save(*args, **kwargs)