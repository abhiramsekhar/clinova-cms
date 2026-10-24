"""
cms_backendapp/serializers_admin.py
DRF serializers for Admin domain:
- User
- Staff
- Department
- Setting
- AuditLog
- Notification
"""

from decimal import Decimal
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .models import User, Staff, Department, Setting, AuditLog, Notification, Role


class UserSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="user_id", read_only=True)
    role = serializers.CharField(source="role.role_id", read_only=True)
    staffId = serializers.CharField(source="staff.staff_id", read_only=True, allow_null=True)
    staffName = serializers.CharField(source="staff.name", read_only=True, allow_null=True)
    isActive = serializers.BooleanField(source="is_active")
    failedAttempts = serializers.IntegerField(source="failed_attempts", read_only=True)
    lockedUntil = serializers.DateTimeField(source="locked_until", read_only=True, allow_null=True)
    lastLogin = serializers.DateTimeField(source="last_login", read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "role",
            "staffId",
            "staffName",
            "isActive",
            "failedAttempts",
            "lockedUntil",
            "lastLogin",
        ]
        read_only_fields = ["id", "lastLogin"]


class StaffSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="staff_id", read_only=True)
    departmentId = serializers.PrimaryKeyRelatedField(
        source="department", queryset=Department.objects.all(), required=False, allow_null=True
    )
    departmentName = serializers.CharField(source="department.name", read_only=True, allow_null=True)
    role = serializers.CharField(source="role.role_id", read_only=True)
    roleId = serializers.SlugRelatedField(
        source="role", slug_field="role_id", queryset=Role.objects.all(), write_only=True, required=False
    )
    username = serializers.CharField(write_only=True, required=False, max_length=50)
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)
    avatarUrl = serializers.CharField(source="avatar_url", required=False, allow_null=True, allow_blank=True)
    consultationFee = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source="is_active", read_only=True)
    joinedAt = serializers.DateField(source="date_joined", read_only=True)

    class Meta:
        model = Staff
        fields = [
            "id",
            "name",
            "designation",
            "departmentId",
            "departmentName",
            "role",
            "roleId",
            "phone",
            "email",
            "avatarUrl",
            "consultationFee",
            "isActive",
            "joinedAt",
            "username",
            "password",
        ]
        read_only_fields = ["id", "joinedAt"]

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user account with this username already exists.")
        return value

    def validate(self, attrs):
        if self.instance is not None:
            if "username" in attrs or "password" in attrs:
                raise serializers.ValidationError({
                    "username": "Login credentials can only be set when creating staff."
                })
            return attrs

        required = [field for field in ("role", "username", "password") if not attrs.get(field)]
        if not attrs.get("email"):
            required.append("email")
        if required:
            raise serializers.ValidationError({
                field: "This field is required when creating a staff login account." for field in required
            })

        try:
            validate_password(attrs["password"], user=User(username=attrs["username"]))
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages}) from error
        return attrs

    def get_consultationFee(self, obj):
        if hasattr(obj, "doctor_profile") and obj.doctor_profile:
            return int(round(float(obj.doctor_profile.consultation_fee) * 100))
        return None

    @transaction.atomic
    def create(self, validated_data):
        username = validated_data.pop("username")
        raw_password = validated_data.pop("password")
        staff = super().create(validated_data)

        user = User(staff=staff, username=username, role=staff.role, is_active=staff.is_active)
        user.set_password(raw_password)
        user.save()

        if staff.role and staff.role.role_id == "DOCTOR":
            from cms_doctorapp.models import Doctor
            Doctor.objects.create(staff=staff, department=staff.department)
        return staff

    @transaction.atomic
    def update(self, instance, validated_data):
        staff = super().update(instance, validated_data)
        account = User.objects.filter(staff=staff).first()
        if account and staff.role_id:
            account.role_id = staff.role_id
            account.save(update_fields=["role", "updated_at"])

        if "department" in validated_data:
            from cms_doctorapp.models import Doctor
            Doctor.objects.filter(staff=staff).update(department=staff.department)

        if staff.role and staff.role.role_id == "DOCTOR":
            from cms_doctorapp.models import Doctor
            Doctor.objects.get_or_create(staff=staff, defaults={"department": staff.department})
        return staff


class DepartmentSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="department_id", read_only=True)
    headDoctorId = serializers.CharField(source="head_doctor.staff_id", read_only=True, allow_null=True)
    headDoctorName = serializers.CharField(source="head_doctor.name", read_only=True, allow_null=True)
    defaultFee = serializers.SerializerMethodField()
    isBookable = serializers.BooleanField(source="is_bookable", default=True)
    isActive = serializers.BooleanField(source="is_active", default=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Department
        fields = [
            "id",
            "name",
            "code",
            "headDoctorId",
            "headDoctorName",
            "defaultFee",
            "isBookable",
            "description",
            "isActive",
            "createdAt",
            "updatedAt",
        ]
        read_only_fields = ["id", "createdAt", "updatedAt"]

    def get_defaultFee(self, obj):
        return int(round(float(obj.default_fee) * 100))

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "defaultFee" in data:
            ret["default_fee"] = Decimal(data["defaultFee"]) / Decimal("100")
        return ret


class SettingSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="setting_id", read_only=True)

    class Meta:
        model = Setting
        fields = ["id", "key", "value", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="log_id", read_only=True)
    userId = serializers.CharField(source="user.user_id", read_only=True, allow_null=True)
    userName = serializers.CharField(source="user.username", read_only=True, allow_null=True)
    resourceType = serializers.CharField(source="entity_type", read_only=True)
    resourceId = serializers.CharField(source="entity_id", read_only=True)
    ipAddress = serializers.CharField(source="ip_address", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "userId",
            "userName",
            "action",
            "resourceType",
            "resourceId",
            "details",
            "ipAddress",
            "createdAt",
        ]
        read_only_fields = ["id", "createdAt"]


class NotificationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="notification_id", read_only=True)
    type = serializers.CharField(source="notification_type")
    targetRole = serializers.CharField(source="target_role")
    targetUserId = serializers.CharField(source="target_user.user_id", read_only=True, allow_null=True)
    isRead = serializers.BooleanField(source="is_read")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "type",
            "title",
            "message",
            "targetRole",
            "targetUserId",
            "isRead",
            "link",
            "createdAt",
        ]
        read_only_fields = ["id", "createdAt"]
