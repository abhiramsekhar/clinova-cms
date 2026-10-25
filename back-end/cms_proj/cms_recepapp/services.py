"""
cms_recepapp/services.py
Business logic services for reception workflows:
- Slot calculations & slot board
- Walk-in slot determination
- Consultation & registration fee resolution
"""

import datetime
import json
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from cms_backendapp.audit import log_audit
from cms_backendapp.models import Setting, Department, Staff, AuditLog
from cms_doctorapp.models import Doctor
from .models import Appointment, Patient, Bill, BillItem, Payment


DEFAULT_CONSULTATION_FEE_PAISE = 50000  # ₹500
DEFAULT_REGISTRATION_FEE_PAISE = 20000  # ₹200


def receptionist_bills(queryset):
    """Only invoices made entirely of registration and consultation charges."""
    allowed = [BillItem.ItemType.REGISTRATION, BillItem.ItemType.CONSULTATION]
    eligible = BillItem.objects.filter(item_type__in=allowed).values("bill_id")
    other_charges = BillItem.objects.exclude(item_type__in=allowed).values("bill_id")
    return queryset.filter(pk__in=eligible).exclude(pk__in=other_charges)


@transaction.atomic
def mark_expired_scheduled_appointments(request=None, now=None):
    """Persist prior-booking NO_SHOW after the configured arrival grace period."""
    current_time = timezone.localtime(now) if now else timezone.localtime()
    try:
        grace_minutes = max(0, int(get_setting("appointment.noShowGraceMinutes", 15)))
    except (TypeError, ValueError):
        grace_minutes = 15
    current_date = current_time.date()
    pending = Appointment.objects.select_for_update().filter(
        status=Appointment.Status.SCHEDULED,
        booking_mode=Appointment.BookingMode.PRIOR,
        appointment_date__lte=current_date,
    ).order_by("appointment_date", "time_slot")
    updated_count = 0

    for appointment in pending:
        # An explicit late-arrival review protects today's restored booking
        # while staff completes the separate manual check-in step.
        if appointment.appointment_date == current_date and AuditLog.objects.filter(
            action="UNDO_NO_SHOW_APPOINTMENT", entity_type="APPOINTMENT",
            entity_id=appointment.pk, details__appointmentDate=current_date.isoformat(),
        ).exists():
            continue
        try:
            scheduled_time = datetime.time.fromisoformat(str(appointment.time_slot))
        except ValueError:
            continue
        scheduled_at = datetime.datetime.combine(appointment.appointment_date, scheduled_time)
        scheduled_at = timezone.make_aware(scheduled_at, timezone.get_current_timezone())
        if current_time < scheduled_at + datetime.timedelta(minutes=grace_minutes):
            continue

        notes_prefix = f"{appointment.notes}\n" if appointment.notes else ""
        notes = f"{notes_prefix}Automatically marked No-show after {grace_minutes}-minute arrival grace period"
        changed = Appointment.objects.filter(
            pk=appointment.pk,
            status=Appointment.Status.SCHEDULED,
        ).update(
            status=Appointment.Status.NO_SHOW,
            notes=notes,
            updated_at=timezone.now(),
        )
        if changed:
            updated_count += changed
            log_audit(
                action="AUTO_NO_SHOW_APPOINTMENT",
                entity_type="APPOINTMENT",
                entity_id=appointment.appointment_id,
                details={"graceMinutes": grace_minutes},
                request=request,
            )

    return updated_count


def get_setting(key, fallback=None):
    try:
        s = Setting.objects.filter(key=key).first()
        if s and s.value:
            return json.loads(s.value)
    except Exception:
        pass
    return fallback


def time_to_minutes(time_str):
    try:
        parts = str(time_str).split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return 0


def minutes_to_time(minutes):
    h = minutes // 60
    m = minutes % 60
    return f"{str(h).zfill(2)}:{str(m).zfill(2)}"


def get_slot_config():
    step = get_setting("appointment.slotDuration", 30)
    try:
        step = int(step)
    except (TypeError, ValueError):
        step = 30
    if step <= 0:
        step = 30

    start_str = get_setting("appointment.startTime", "09:00")
    end_str = get_setting("appointment.endTime", "17:00")
    start = time_to_minutes(start_str) or 540   # 09:00
    end = time_to_minutes(end_str) or 1020     # 17:00
    return {"start": start, "end": end, "step": step}


def get_all_slots():
    cfg = get_slot_config()
    slots = []
    idx = 0
    m = cfg["start"]
    while m + cfg["step"] <= cfg["end"]:
        slots.append({
            "time": minutes_to_time(m),
            "index": idx,
            "token": idx + 1,
        })
        m += cfg["step"]
        idx += 1
    return slots


def resolve_doctor(doctor_ident):
    """Resolves Doctor instance from staff_id (e.g. staff-doc-01) or doctor_id (e.g. doc-01)."""
    return Doctor.objects.filter(
        Q(staff__staff_id=doctor_ident) | Q(doctor_id=doctor_ident)
    ).select_related("staff", "department").first()


def get_consultation_fee(doctor_ident):
    """Returns consultation fee in integer paise."""
    doc = resolve_doctor(doctor_ident)
    if not doc:
        return DEFAULT_CONSULTATION_FEE_PAISE

    if doc.consultation_fee and doc.consultation_fee > 0:
        return int(round(float(doc.consultation_fee) * 100))

    dept = doc.department or getattr(doc.staff, "department", None)
    if dept and dept.default_fee and dept.default_fee > 0:
        return int(round(float(dept.default_fee) * 100))

    return DEFAULT_CONSULTATION_FEE_PAISE


def get_registration_fee():
    """Returns registration fee in integer paise."""
    val = get_setting("billing.registrationFee", DEFAULT_REGISTRATION_FEE_PAISE)
    try:
        return int(val)
    except (TypeError, ValueError):
        return DEFAULT_REGISTRATION_FEE_PAISE


def get_slot_board(doctor_ident, date_obj, now=None):
    """
    Returns the slot board for a doctor on a given date.
    Each slot has state: 'free' | 'booked' | 'past'.
    """
    doc = resolve_doctor(doctor_ident)
    if not doc or not doc.staff.is_active:
        return []
    department = doc.department or doc.staff.department
    if not department or not department.is_active or not department.is_bookable:
        return []

    if now is None:
        now = timezone.localtime()

    today_str = now.date().isoformat()
    target_date_str = date_obj.strftime("%Y-%m-%d") if isinstance(date_obj, (datetime.date, datetime.datetime)) else str(date_obj)
    now_minutes = now.hour * 60 + now.minute + now.second / 60 + now.microsecond / 60000000
    cfg = get_slot_config()

    day_appts = list(Appointment.objects.filter(
        doctor=doc,
        appointment_date=target_date_str
    ).values("appointment_id", "time_slot", "status", "patient_id", "token_number"))

    all_slots = get_all_slots()
    board = []
    # Every issued token stays reserved, including cancelled and No-show history.
    used_tokens = {a["token_number"] for a in day_appts if a["token_number"] is not None}

    for s in all_slots:
        active = next((a for a in day_appts if a["time_slot"] == s["time"]), None)
        freed = False
        start_m = time_to_minutes(s["time"])
        end_m = start_m + cfg["step"]

        if active:
            state = "booked"
        # Historical reservations remain blocked; started slots are never offered.
        elif target_date_str < today_str or (target_date_str == today_str and start_m < now_minutes):
            state = "past"
        else:
            state = "free"

        token = active["token_number"] if active and active["token_number"] is not None else s["token"]
        if not active and state == "free":
            while token in used_tokens:
                token += 1
            used_tokens.add(token)
        board.append({
            "time": s["time"],
            "index": s["index"],
            "token": token,
            "state": state,
            "freed": freed,
            "endM": end_m,
            "patientId": active["patient_id"] if active else None,
            "appointmentId": active["appointment_id"] if active else None,
        })

    return board


def get_next_walkin_slot(doctor_ident, now=None):
    """Finds next available walk-in slot for doctor today."""
    if now is None:
        now = timezone.localtime()
    today_str = now.date().isoformat()

    board = get_slot_board(doctor_ident, today_str, now=now)
    slot = next((s for s in board if s["state"] == "free"), None)
    if not slot:
        return None

    return slot
