"""
cms_labapp/serializers.py
DRF serializers for Lab domain:
- LabTestCatalog
- LabTestResult
"""

import math
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

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Test name is required.")
        duplicate = LabTestCatalog.objects.filter(test_name__iexact=value)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError("A lab test with this name already exists.")
        return value

    def validate_code(self, value):
        value = value.strip() or None if value else None
        if value:
            duplicate = LabTestCatalog.objects.filter(code__iexact=value)
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError("A lab test with this code already exists.")
        return value

    def validate_parameters(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Parameters must be a JSON array.")

        role = getattr(getattr(self.context.get("request"), "user", None), "role", None)
        role_id = getattr(role, "role_id", "")
        range_fields = {"refMin", "refMax", "criticalMin", "criticalMax"}
        existing = self.instance.parameters if self.instance and isinstance(self.instance.parameters, list) else []

        if role_id == "LAB_TECH" and self.instance is None and not value:
            raise serializers.ValidationError("At least one test parameter is required.")

        if role_id == "LAB_TECH" and self.instance:
            if len(value) != len(existing):
                raise serializers.ValidationError("Only ranges for existing parameters can be changed.")
            updated_parameters = []
            for current, submitted in zip(existing, value):
                if not isinstance(current, dict) or not isinstance(submitted, dict):
                    raise serializers.ValidationError("Each test parameter must be an object.")
                if submitted.get("name") != current.get("name"):
                    raise serializers.ValidationError("Parameter names cannot be changed.")
                if set(submitted) - ({"name"} | range_fields):
                    raise serializers.ValidationError("Only reference and critical ranges can be changed.")
                updated = current.copy()
                updated.update({key: submitted[key] for key in range_fields if key in submitted})
                for key in (("refMin", "min"), ("refMax", "max"), ("criticalMin", "criticalLow"), ("criticalMax", "criticalHigh")):
                    if key[0] in submitted:
                        updated.pop(key[1], None)
                updated_parameters.append(updated)
            value = updated_parameters

        names = set()
        for parameter in value:
            if not isinstance(parameter, dict) or not str(parameter.get("name", "")).strip():
                raise serializers.ValidationError("Each parameter must have a name.")
            name = parameter["name"].strip()
            if name.casefold() in names:
                raise serializers.ValidationError("Parameter names must be unique within a test.")
            names.add(name.casefold())
            for key in range_fields:
                bound = parameter.get(key)
                if bound is None:
                    continue
                if isinstance(bound, bool):
                    raise serializers.ValidationError(f"{key} must be a finite number or null.")
                try:
                    numeric_bound = float(bound)
                except (TypeError, ValueError) as exc:
                    raise serializers.ValidationError(f"{key} must be a finite number or null.") from exc
                if not math.isfinite(numeric_bound):
                    raise serializers.ValidationError(f"{key} must be a finite number or null.")

            ref_min = parameter.get("refMin")
            ref_max = parameter.get("refMax")
            if ref_min is not None and ref_max is not None and float(ref_min) > float(ref_max):
                raise serializers.ValidationError(f"Reference minimum cannot exceed maximum for {name}.")
        return value

    def get_price(self, obj):
        return int(round(float(obj.price) * 100))

    def to_internal_value(self, data):
        role = getattr(getattr(self.context.get("request"), "user", None), "role", None)
        if getattr(role, "role_id", "") == "LAB_TECH" and "price" in data:
            raise serializers.ValidationError({"price": "Lab technicians cannot set catalog prices."})
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
