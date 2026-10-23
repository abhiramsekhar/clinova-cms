"""
cms_pharmapp/serializers.py
DRF serializers for Pharmacy domain:
- Medicine
- Supplier
- PurchaseOrder
- StockLedgerEntry
"""

import datetime
from decimal import Decimal
from rest_framework import serializers

from cms_backendapp.models import Staff
from .models import Medicine, Supplier, PurchaseOrder, StockLedgerEntry


class MedicineSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="medicine_id", read_only=True)
    genericName = serializers.CharField(source="generic_name", required=False, allow_null=True, allow_blank=True)
    costPrice = serializers.SerializerMethodField()
    unitPrice = serializers.SerializerMethodField()
    sellingPrice = serializers.SerializerMethodField()
    stockQuantity = serializers.IntegerField(source="stock_quantity", default=0)
    reorderThreshold = serializers.IntegerField(source="reorder_threshold", default=10)
    expiryDate = serializers.DateField(source="expiry_date", required=False, allow_null=True)
    isActive = serializers.BooleanField(source="is_active", default=True)
    stockLevel = serializers.SerializerMethodField()
    hasExpired = serializers.SerializerMethodField()
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
            "reorderThreshold",
            "expiryDate",
            "batches",
            "isActive",
            "stockLevel",
            "hasExpired",
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

    def get_stockLevel(self, obj):
        if obj.stock_quantity <= 0:
            return "OUT_OF_STOCK"
        elif obj.stock_quantity <= obj.reorder_threshold:
            return "LOW_STOCK"
        return "NORMAL"

    def get_hasExpired(self, obj):
        today = datetime.date.today()
        if obj.expiry_date and obj.expiry_date < today:
            return True
        if isinstance(obj.batches, list):
            for b in obj.batches:
                exp = b.get("expiryDate")
                if exp:
                    try:
                        exp_d = datetime.date.fromisoformat(exp) if isinstance(exp, str) else exp
                        if exp_d < today:
                            return True
                    except Exception:
                        pass
        return False

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
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


class PurchaseOrderSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="order_id", read_only=True)
    supplierId = serializers.CharField(source="supplier.supplier_id", read_only=True)
    supplierName = serializers.CharField(source="supplier.name", read_only=True)
    totalAmount = serializers.SerializerMethodField()
    orderDate = serializers.DateField(source="order_date", required=False, allow_null=True)
    expectedDate = serializers.DateField(source="expected_date", required=False, allow_null=True)
    receivedDate = serializers.DateField(source="received_date", required=False, allow_null=True)
    items = serializers.JSONField(source="items_data", required=False)
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

    def get_totalAmount(self, obj):
        return int(round(float(obj.total_amount) * 100))


class StockLedgerEntrySerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="entry_id", read_only=True)
    medicineId = serializers.CharField(source="medicine.medicine_id", read_only=True)
    medicineName = serializers.CharField(source="medicine.name", read_only=True)
    batchNo = serializers.CharField(source="batch_no", read_only=True)
    entryType = serializers.CharField(source="entry_type", read_only=True)
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
            "reference_id",
            "note",
            "performedBy",
            "createdAt",
        ]
        read_only_fields = ["id", "createdAt"]
