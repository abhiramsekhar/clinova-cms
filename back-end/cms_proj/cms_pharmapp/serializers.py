"""
cms_pharmapp/serializers.py
DRF serializers for Pharmacy domain:
- Medicine
- Supplier
- PurchaseOrder
- StockLedgerEntry
"""

import datetime
import calendar
import math
from decimal import Decimal, InvalidOperation
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from cms_backendapp.models import Staff
from .models import Medicine, Supplier, PurchaseOrder, StockLedgerEntry

MAX_ORDER_MONTHS = 3
INITIAL_ORDER_MAX_QUANTITY = 400


def _add_months(value, months):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)


def _catalogue_for_supplier(supplier):
    catalogue = {}
    entries = supplier.typical_medicines if isinstance(supplier.typical_medicines, list) else []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        medicine_id = str(entry.get("medicineId") or entry.get("id") or "")
        try:
            raw_price = Decimal(str(entry.get("fixedUnitPrice", entry.get("unitCost", entry.get("rate", 0)))))
            if raw_price != raw_price.to_integral_value():
                continue
            price = int(raw_price)
        except (InvalidOperation, TypeError, ValueError):
            continue
        if medicine_id and price > 0:
            catalogue[medicine_id] = price
    return catalogue

class MedicineSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="medicine_id", read_only=True)
    genericName = serializers.CharField(source="generic_name", required=False, allow_null=True, allow_blank=True)
    costPrice = serializers.SerializerMethodField()
    unitPrice = serializers.SerializerMethodField()
    sellingPrice = serializers.SerializerMethodField()
    stockQuantity = serializers.IntegerField(source="stock_quantity", read_only=True)
    counterStock = serializers.IntegerField(source="stock_quantity", read_only=True)
    storageStock = serializers.IntegerField(source="storage_quantity", read_only=True)
    totalStock = serializers.SerializerMethodField()
    counterCapacity = serializers.IntegerField(source="counter_capacity", required=False, min_value=1)
    reorderThreshold = serializers.IntegerField(source="reorder_threshold", required=False, min_value=1)
    expiryDate = serializers.DateField(source="expiry_date", required=False, allow_null=True)
    isActive = serializers.BooleanField(source="is_active", default=True)
    stockLevel = serializers.SerializerMethodField()
    hasExpired = serializers.SerializerMethodField()
    allBatchesExpired = serializers.SerializerMethodField()
    hasExpiredBatches = serializers.SerializerMethodField()
    defaultReorderThreshold = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Medicine
        fields = [
            "id",
            "name",
            "genericName",
            "manufacturer",
            "category",
            "form",
            "strength",
            "costPrice",
            "unitPrice",
            "sellingPrice",
            "stockQuantity",
            "counterStock",
            "storageStock",
            "totalStock",
            "counterCapacity",
            "reorderThreshold",
            "expiryDate",
            "batches",
            "isActive",
            "stockLevel",
            "hasExpired",
            "allBatchesExpired",
            "hasExpiredBatches",
            "defaultReorderThreshold",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def get_costPrice(self, obj):
        return int(round(float(obj.cost_price) * 100))

    def get_unitPrice(self, obj):
        return int(round(float(obj.selling_price) * 100))

    def get_sellingPrice(self, obj):
        return int(round(float(obj.selling_price) * 100))

    def get_totalStock(self, obj):
        return obj.stock_quantity + obj.storage_quantity

    def get_stockLevel(self, obj):
        if obj.stock_quantity <= 0:
            return "OUT_OF_STOCK"
        elif obj.stock_quantity <= obj.reorder_threshold:
            return "LOW_STOCK"
        return "NORMAL"

    def get_hasExpired(self, obj):
        today = timezone.localdate()
        return any(
            self._batch_expiry(batch) is not None
            and self._batch_expiry(batch) < today
            and self._batch_quantity(batch) > 0
            for batch in (obj.batches if isinstance(obj.batches, list) else [])
        )

    def get_hasExpiredBatches(self, obj):
        return self.get_hasExpired(obj)

    def get_allBatchesExpired(self, obj):
        batches = [
            batch for batch in (obj.batches if isinstance(obj.batches, list) else [])
            if self._batch_quantity(batch) > 0
        ]
        return bool(batches) and all(
            self._batch_expiry(batch) is not None
            and self._batch_expiry(batch) < datetime.date.today()
            for batch in batches
        )

    def get_defaultReorderThreshold(self, obj):
        return max(1, math.floor(obj.counter_capacity * 0.25))

    @staticmethod
    def _batch_quantity(batch):
        try:
            return max(0, int(batch.get("quantity", 0)))
        except (AttributeError, TypeError, ValueError):
            return 0

    @staticmethod
    def _batch_expiry(batch):
        try:
            value = batch.get("expiryDate")
            return datetime.date.fromisoformat(str(value)[:10]) if value else None
        except (AttributeError, TypeError, ValueError):
            return None

    def validate(self, attrs):
        capacity = attrs.get("counter_capacity", getattr(self.instance, "counter_capacity", 100))
        threshold = attrs.get(
            "reorder_threshold",
            getattr(self.instance, "reorder_threshold", max(1, math.floor(capacity * 0.25))),
        )
        errors = {}
        if threshold < 1:
            errors["reorderThreshold"] = "Reorder level must be a positive whole number."
        if threshold > capacity:
            errors["reorderThreshold"] = "Reorder level cannot exceed counter capacity."
        if self.instance is not None and capacity < self.instance.stock_quantity:
            errors["counterCapacity"] = "Counter capacity cannot be less than the current counter stock."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if self.instance is None:
            capacity = ret.get("counter_capacity", 100)
            ret.setdefault("reorder_threshold", max(1, math.floor(capacity * 0.25)))
        # Parse wire money in paise to Decimal
        if "unitPrice" in data:
            ret["selling_price"] = Decimal(data["unitPrice"]) / Decimal("100")
        elif "sellingPrice" in data:
            ret["selling_price"] = Decimal(data["sellingPrice"]) / Decimal("100")
        if "costPrice" in data:
            ret["cost_price"] = Decimal(data["costPrice"]) / Decimal("100")
        return ret


class SupplierSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="supplier_id", read_only=True)
    contactPerson = serializers.CharField(source="contact_person", required=False, allow_null=True, allow_blank=True)
    typicalMedicines = serializers.JSONField(source="typical_medicines", required=False)
    isActive = serializers.BooleanField(source="is_active", default=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "contactPerson",
            "phone",
            "email",
            "address",
            "typicalMedicines",
            "isActive",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def validate_typicalMedicines(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Supplier catalogue must be a list.")
        errors = {}
        seen_medicine_ids = set()
        for index, entry in enumerate(value):
            if not isinstance(entry, dict):
                errors[index] = "Each catalogue entry must be an object."
                continue
            medicine_id = str(entry.get("medicineId") or entry.get("id") or "")
            if medicine_id and medicine_id in seen_medicine_ids:
                errors[index] = "A medicine can only appear once in a supplier catalogue."
                continue
            seen_medicine_ids.add(medicine_id)
            if not medicine_id or not Medicine.objects.filter(pk=medicine_id, is_active=True).exists():
                errors[index] = "Select an active medicine for each catalogue entry."
                continue
            raw_price = entry.get("fixedUnitPrice", entry.get("unitCost", entry.get("rate", 0)))
            try:
                parsed_price = Decimal(str(raw_price))
                price = int(parsed_price)
            except (InvalidOperation, TypeError, ValueError, OverflowError):
                parsed_price = Decimal("0")
                price = 0
            if isinstance(raw_price, bool) or parsed_price != price or price <= 0:
                errors[index] = "Catalogue unit cost must be a positive amount in paise."
        if errors:
            raise serializers.ValidationError(errors)
        normalized = []
        for entry in value:
            medicine_id = str(entry.get("medicineId") or entry.get("id"))
            price = int(Decimal(str(entry.get("fixedUnitPrice", entry.get("unitCost", entry.get("rate"))))))
            normalized.append({
                "medicineId": medicine_id,
                "fixedUnitPrice": price,
            })
        return normalized


class PurchaseOrderSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="order_id", read_only=True)
    supplierId = serializers.CharField(source="supplier.supplier_id", read_only=True)
    supplierName = serializers.CharField(source="supplier.name", read_only=True)
    totalAmount = serializers.SerializerMethodField()
    orderDate = serializers.DateField(source="order_date", required=False, allow_null=True)
    expectedDate = serializers.DateField(source="expected_date", required=False, allow_null=True)
    receivedDate = serializers.DateField(source="received_date", required=False, allow_null=True)
    items = serializers.JSONField(source="items_data", required=False)
    status = serializers.ChoiceField(choices=PurchaseOrder.Status.choices, read_only=True)
    createdBy = serializers.CharField(source="created_by.staff_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "supplierId",
            "supplierName",
            "status",
            "totalAmount",
            "orderDate",
            "expectedDate",
            "receivedDate",
            "notes",
            "items",
            "createdBy",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def validate(self, attrs):
        items = attrs.get("items_data")
        if items is None and self.instance is not None:
            items = self.instance.items_data
        if items is None:
            if self.instance is None:
                raise serializers.ValidationError({"items": "Add at least one catalogue item."})
            return attrs
        if not isinstance(items, list):
            raise serializers.ValidationError({"items": "Purchase order items must be a list."})
        supplier = attrs.get("supplier", getattr(self.instance, "supplier", None))
        if supplier is None:
            return attrs
        if not supplier.is_active:
            raise serializers.ValidationError({"supplierId": "Inactive suppliers cannot receive new purchase orders."})
        if self.instance is None and self.initial_data.get("status") not in (None, PurchaseOrder.Status.ORDERED):
            raise serializers.ValidationError({"status": "New purchase orders must start as Ordered."})

        expected_date = attrs.get("expected_date", getattr(self.instance, "expected_date", None))
        today = timezone.localdate()
        if self.instance is None or "expected_date" in attrs:
            if expected_date is None:
                raise serializers.ValidationError({"expectedDate": "Expected delivery date is required."})
            if expected_date < today or expected_date > _add_months(today, MAX_ORDER_MONTHS):
                raise serializers.ValidationError({
                    "expectedDate": f"Expected delivery date must be within {MAX_ORDER_MONTHS} months from today."
                })

        catalogue = _catalogue_for_supplier(supplier)
        if not items:
            raise serializers.ValidationError({"items": "Add at least one catalogue item."})
        errors = {}
        seen_medicine_ids = set()
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                errors[index] = "Each purchase item must be an object."
                continue
            medicine_id = str(item.get("medicineId") or "")
            if medicine_id in seen_medicine_ids:
                errors[index] = "A medicine can only appear once in an order."
                continue
            seen_medicine_ids.add(medicine_id)
            if medicine_id not in catalogue:
                errors[index] = "This medicine is not in the selected supplier's catalogue."
                continue
            try:
                raw_quantity = item.get("quantity", 0)
                quantity = int(raw_quantity)
            except (TypeError, ValueError):
                quantity = 0
                raw_quantity = 0
            if isinstance(raw_quantity, bool) or raw_quantity != quantity or quantity <= 0:
                errors[index] = "Quantity must be a positive whole number."
                continue
            item["quantity"] = quantity
            medicine = Medicine.objects.filter(pk=medicine_id).first()
            if medicine is None:
                errors[index] = f"Medicine '{medicine_id}' does not exist."
                continue
            if not medicine.is_active:
                errors[index] = f"{medicine.name} is inactive and cannot be ordered."
                continue
            maximum_quantity, has_usage_history = self._maximum_order_quantity(medicine)
            if quantity > maximum_quantity:
                if has_usage_history:
                    errors[index] = f"Order exceeds the {MAX_ORDER_MONTHS}-month limit ({maximum_quantity} units maximum)."
                else:
                    errors[index] = f"Initial order exceeds the {INITIAL_ORDER_MAX_QUANTITY}-unit limit."
                continue
            item["unitCost"] = catalogue[medicine_id]
            item["name"] = medicine.name
            item["lineTotal"] = quantity * catalogue[medicine_id]

        if errors:
            raise serializers.ValidationError({"items": errors})

        attrs["items_data"] = items
        attrs["total_amount"] = sum(
            item["quantity"] * Decimal(item["unitCost"]) for item in items
        ) / Decimal("100")
        return attrs

    @staticmethod
    def _maximum_order_quantity(medicine):
        end_date = timezone.localdate()
        start_date = _add_months(end_date, -MAX_ORDER_MONTHS)
        start_at = timezone.make_aware(datetime.datetime.combine(start_date, datetime.time.min))
        end_at = timezone.make_aware(datetime.datetime.combine(
            end_date + datetime.timedelta(days=1),
            datetime.time.min,
        ))
        dispensed = StockLedgerEntry.objects.filter(
            medicine=medicine,
            entry_type="DISPENSE",
            created_at__gte=start_at,
            created_at__lt=end_at,
        ).aggregate(total=Sum("quantity"))["total"] or 0
        if not dispensed:
            return INITIAL_ORDER_MAX_QUANTITY, False
        monthly_average = Decimal(abs(dispensed)) / Decimal(MAX_ORDER_MONTHS)
        return math.ceil(monthly_average * MAX_ORDER_MONTHS), True

    def get_totalAmount(self, obj):
        return int(round(float(obj.total_amount) * 100))

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        sup_id = data.get("supplierId") or data.get("supplier")
        if sup_id:
            try:
                ret["supplier"] = Supplier.objects.get(supplier_id=sup_id)
            except Supplier.DoesNotExist:
                raise serializers.ValidationError({"supplierId": f"Supplier with ID '{sup_id}' does not exist."})
        elif self.instance is None:
            raise serializers.ValidationError({"supplierId": "supplierId is required."})

        return ret


class StockLedgerEntrySerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="entry_id", read_only=True)
    medicineId = serializers.CharField(source="medicine.medicine_id", read_only=True)
    medicineName = serializers.CharField(source="medicine.name", read_only=True)
    batchNo = serializers.CharField(source="batch_no", read_only=True)
    entryType = serializers.CharField(source="entry_type", read_only=True)
    referenceId = serializers.CharField(source="reference_id", read_only=True)
    performedBy = serializers.CharField(source="performed_by.staff_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = StockLedgerEntry
        fields = [
            "id",
            "medicineId",
            "medicineName",
            "batchNo",
            "entryType",
            "quantity",
            "referenceId",
            "note",
            "performedBy",
            "createdAt",
        ]
        read_only_fields = ["id", "createdAt"]
