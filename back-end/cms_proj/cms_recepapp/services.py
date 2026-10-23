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
from django.db.models import Q
from django.utils import timezone

from cms_backendapp.models import Setting, Department, Staff
from cms_doctorapp.models import Doctor
from .models import Appointment, Patient, Bill, BillItem, Payment


DEFAULT_CONSULTATION_FEE_PAISE = 50000  # ₹500
DEFAULT_REGISTRATION_FEE_PAISE = 20000  # ₹200
NO_SHOW_GRACE_MIN = 15
INACTIVE_STATUSES = ["CANCELLED", "NO_SHOW"]


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
    if not doc:
        return []

    if now is None:
        now = datetime.datetime.now()

    today_str = now.strftime("%Y-%m-%d")
    target_date_str = date_obj.strftime("%Y-%m-%d") if isinstance(date_obj, (datetime.date, datetime.datetime)) else str(date_obj)
    now_minutes = now.hour * 60 + now.minute
    cfg = get_slot_config()

    day_appts = list(Appointment.objects.filter(
        doctor=doc,
        appointment_date=target_date_str
    ).values("appointment_id", "time_slot", "status", "patient_id"))

    all_slots = get_all_slots()
    board = []

    for s in all_slots:
        active = next((a for a in day_appts if a["time_slot"] == s["time"] and a["status"] not in INACTIVE_STATUSES), None)
        freed = bool(not active and any(a for a in day_appts if a["time_slot"] == s["time"] and a["status"] == "NO_SHOW"))
        start_m = time_to_minutes(s["time"])
        end_m = start_m + cfg["step"]

        if active:
            state = "booked"
        elif target_date_str < today_str or (target_date_str == today_str and start_m <= now_minutes):
            state = "past"
        else:
            state = "free"

        board.append({
            "time": s["time"],
            "index": s["index"],
            "token": s["token"],
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
        now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    now_minutes = now.hour * 60 + now.minute

    board = get_slot_board(doctor_ident, today_str, now=now)
    slot = next((s for s in board if s["state"] != "booked" and (s["endM"] > now_minutes or s["freed"])), None)
    if not slot:
        return None

    # Next token in doctor's queue today
    doc = resolve_doctor(doctor_ident)
    used_tokens = list(Appointment.objects.filter(
        doctor=doc,
        appointment_date=today_str
    ).exclude(status__in=INACTIVE_STATUSES).values_list("token_number", flat=True))
    valid_tokens = [t for t in used_tokens if t is not None]
    next_token = max(valid_tokens, default=0) + 1

    return {
        **slot,
        "token": next_token,
    }
