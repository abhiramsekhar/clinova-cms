"""
cms_labapp/serializers.py
DRF serializers for Lab domain:
- LabTestCatalog
- LabTestResult
"""

from decimal import Decimal
from rest_framework import serializers

from cms_backendapp.models import LabTestCatalog, Staff
from .models import LabTestResult


class LabCatalogSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="test_catalog_id", read_only=True)
    name = serializers.CharField(source="test_name")
    testName = serializers.CharField(source="test_name", read_only=True)
    sampleType = serializers.CharField(source="sample_type", required=False, allow_null=True, allow_blank=True)
    turnaroundHrs = serializers.IntegerField(source="turnaround_hrs", default=4)
    price = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source="is_active", default=True)

    class Meta:
        model = LabTestCatalog
        fields = [
            "id",
            "name",
            "testName",
            "code",
            "category",
            "sampleType",
            "parameters",
            "turnaroundHrs",
            "description",
            "price",
            "isActive",
        ]
        read_only_fields = ["id"]

    def get_price(self, obj):
        return int(round(float(obj.price) * 100))

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "price" in data:
            ret["price"] = Decimal(data["price"]) / Decimal("100")
        return ret


class LabResultSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="result_id", read_only=True)
    testId = serializers.CharField(source="test.test_id", read_only=True)
    testName = serializers.CharField(source="test.test_catalog.test_name", read_only=True)
    performedBy = serializers.CharField(source="performed_by.staff_id", read_only=True)
    performedByName = serializers.CharField(source="performed_by.name", read_only=True)
    resultDate = serializers.DateField(source="result_date", read_only=True)
    isCritical = serializers.BooleanField(source="is_critical", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = LabTestResult
        fields = [
            "id",
            "testId",
            "testName",
            "performedBy",
            "performedByName",
            "resultDate",
            "results",
            "isCritical",
            "remarks",
            "createdAt",
        ]
        read_only_fields = ["id", "createdAt"]
