"""
cms_backendapp/permissions.py
Role-based permission classes matching frontend guard.js rules.
"""

from rest_framework.permissions import BasePermission


class IsRole(BasePermission):
    """
    Reusable permission class matching frontend guard.js rules.
    Can be used in multiple styles:
      1. Instantiated directly:
         permission_classes = [IsRole('ADMIN', 'DOCTOR')]
      2. As a class with view.allowed_roles:
         permission_classes = [IsRole]
         allowed_roles = ['ADMIN', 'DOCTOR']
    """

    def __init__(self, *roles):
        self.roles = roles

    def __call__(self):
        return self

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        allowed = self.roles or getattr(view, "allowed_roles", ())
        if not allowed:
            return True

        user_role = getattr(request.user, "role", None)
        role_name = getattr(user_role, "role_id", str(user_role)) if user_role else ""
        return role_name in allowed


# Convenience presets matching the 5 system roles
def IsAdmin():
    return IsRole("ADMIN")


def IsDoctor():
    return IsRole("DOCTOR")


def IsReceptionist():
    return IsRole("RECEPTIONIST")


def IsPharmacist():
    return IsRole("PHARMACIST")


def IsLabTech():
    return IsRole("LAB_TECH")
