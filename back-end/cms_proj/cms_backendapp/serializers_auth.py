"""
cms_backendapp/serializers_auth.py
Auth request and response serializers.
"""

from rest_framework import serializers


class LoginRequestSerializer(serializers.Serializer):
    username = serializers.CharField(required=True, trim_whitespace=True)
    password = serializers.CharField(required=True, write_only=True)


class TokenRefreshRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=True)


class LogoutRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=True)


def format_user_profile(user):
    """Formats a User instance into the canonical frontend contract payload."""
    staff = getattr(user, "staff", None)
    department_id = None
    if staff:
        if hasattr(staff, "department") and staff.department:
            department_id = staff.department.department_id
        elif hasattr(staff, "doctor") and staff.doctor and staff.doctor.department:
            department_id = staff.doctor.department.department_id

    avatar_url = getattr(staff, "avatar_url", None)
    staff_name = staff.name if staff else ""
    staff_id = staff.staff_id if staff else None
    role_id = user.role.role_id if hasattr(user.role, "role_id") else str(user.role)

    return {
        "id": user.user_id,
        "username": user.username,
        "name": staff_name,
        "role": role_id,
        "staffId": staff_id,
        "staffName": staff_name,
        "avatarUrl": avatar_url,
        "departmentId": department_id,
    }
