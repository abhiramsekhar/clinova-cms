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
    form = models.CharField(max_length=30, blank=True, null=True)
    strength = models.CharField(max_length=30, blank=True, null=True)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                      validators=[MinValueValidator(0)])
    selling_price = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                         validators=[MinValueValidator(0)])
    # stock_quantity represents Pharmacy Counter stock.
    stock_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    storage_quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    counter_capacity = models.IntegerField(default=100, validators=[MinValueValidator(1)])
    reorder_threshold = models.IntegerField(default=25, validators=[MinValueValidator(1)])
    expiry_date = models.DateField(blank=True, null=True)
    batches = models.JSONField(default=list, blank=True)
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


class Supplier(models.Model):
    supplier_id = models.CharField(max_length=15, primary_key=True)
    name = models.CharField(max_length=100)
    contact_person = models.CharField(max_length=100, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=100, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    typical_medicines = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "suppliers"

    def __str__(self):
        return self.name

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.supplier_id:
            self.supplier_id = generate_prefixed_id("SUPPLIER", "SUP")
        super().save(*args, **kwargs)


class PurchaseOrder(models.Model):
    class Status(models.TextChoices):
        ORDERED = "ORDERED", "Ordered"
        DELIVERED = "DELIVERED", "Delivered"
        STOCKING = "STOCKING", "Stocking"
        CANCELLED = "CANCELLED", "Cancelled"

    order_id = models.CharField(max_length=15, primary_key=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.ORDERED)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    order_date = models.DateField(blank=True, null=True)
    expected_date = models.DateField(blank=True, null=True)
    received_date = models.DateField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    items_data = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        "cms_backendapp.Staff", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="purchase_orders_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "purchase_orders"

    def __str__(self):
        return f"{self.order_id} ({self.status})"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.order_id:
            self.order_id = generate_prefixed_id("PURCHASE_ORDER", "PO")
        super().save(*args, **kwargs)


class StockLedgerEntry(models.Model):
    entry_id = models.CharField(max_length=15, primary_key=True)
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name="stock_ledger")
    batch_no = models.CharField(max_length=50, blank=True, null=True)
    entry_type = models.CharField(max_length=20)  # PURCHASE, DISPENSE, ADJUSTMENT
    quantity = models.IntegerField(default=0)
    reference_id = models.CharField(max_length=50, blank=True, null=True)
    note = models.TextField(blank=True, null=True)
    performed_by = models.ForeignKey(
        "cms_backendapp.Staff", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="stock_ledger_entries"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_ledger"

    def __str__(self):
        return f"{self.entry_type} {self.quantity} of {self.medicine_id}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.entry_id:
            self.entry_id = generate_prefixed_id("STOCK_LEDGER", "SL")
        super().save(*args, **kwargs)