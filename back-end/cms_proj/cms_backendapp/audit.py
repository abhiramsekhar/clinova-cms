"""
cms_backendapp/audit.py
Centralized audit logging helper for sensitive actions.
"""

from .models import AuditLog


def log_audit(action: str, entity_type: str, entity_id: str, user=None, details=None, request=None):
    """
    Records an entry in the audit_log table.
    """
    ip_address = None
    if request:
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(",")[0].strip()
        else:
            ip_address = request.META.get("REMOTE_ADDR")

        if not user and hasattr(request, "user") and getattr(request.user, "is_authenticated", False):
            user = request.user

    user_obj = None
    if user and hasattr(user, "user_id"):
        user_obj = user

    return AuditLog.objects.create(
        user=user_obj,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        details=details or {},
        ip_address=ip_address,
    )
