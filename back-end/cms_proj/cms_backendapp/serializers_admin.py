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
    departmentId = serializers.CharField(source="department.department_id", read_only=True, allow_null=True)
    departmentName = serializers.CharField(source="department.name", read_only=True, allow_null=True)
    role = serializers.CharField(source="role.role_id", read_only=True)
    roleId = serializers.CharField(write_only=True, required=False)
    avatarUrl = serializers.CharField(source="avatar_url", required=False, allow_null=True, allow_blank=True)
    consultationFee = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source="is_active", default=True)
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
        ]
        read_only_fields = ["id", "joinedAt"]

    def get_consultationFee(self, obj):
        if hasattr(obj, "doctor_profile") and obj.doctor_profile:
            return int(round(float(obj.doctor_profile.consultation_fee) * 100))
        return None

    def create(self, validated_data):
        role_id = self.initial_data.get("roleId") or self.initial_data.get("role")
        if role_id:
            role = Role.objects.filter(role_id=role_id).first()
            if role:
                validated_data["role"] = role

        dept_id = self.initial_data.get("departmentId")
        if dept_id:
            dept = Department.objects.filter(department_id=dept_id).first()
            if dept:
                validated_data["department"] = dept

        return super().create(validated_data)


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
    resourceType = serializers.CharField(source="resource_type")
    resourceId = serializers.CharField(source="resource_id")
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
