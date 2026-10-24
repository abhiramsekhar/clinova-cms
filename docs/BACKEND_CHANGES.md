# Backend Changes

## Authentication
- `cms_backendapp/views_auth.py`: On password mismatch, calculate remaining attempts (`5 - failed_attempts`) and include `attempts_remaining` and descriptive detail message (`Invalid username or password. N attempts remaining.` and `Account locked for 5 minutes due to too many failed attempts.` on reaching 5 attempts) to achieve full parity with legacy `auth.js`.

## Doctor Dashboard (D1)
- `cms_backendapp/views_admin.py`: Restrict `/dashboard/doctor/` to Doctor users with a linked Doctor profile; return doctor-scoped patient, today's pending/completed appointment, pending lab count/list, and active prescription metrics. Existing `todayAppointments`, `pendingLabs`, and `activePrescriptions` fields remain available.
- `docs/API_CONTRACT.md`: Document the response fields and legacy status definitions.

## Doctor Data Scoping (D2-D7)
- `cms_recepapp/views.py`: Doctor patient lists/details and appointment lists/details are restricted to the authenticated Doctor's assigned/seen patients and own appointments. Clinical-history lookup requires an authorized patient while preserving the full longitudinal history across clinicians.
- `cms_doctorapp/views.py`: Doctor consultation, prescription, and lab-order querysets are always self-scoped, even when filters are omitted or altered. Consultation start, prescription creation, and lab-order creation reject cross-doctor/patient access while preserving existing allergy and workflow rules.
- `docs/API_CONTRACT.md`: Document self-scoping and the serializer field shapes used by Doctor pages.
