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

## Admin Continuation (A3-A9)
- `cms_backendapp/views_admin.py`: Apply configured Django password validation to Admin password resets; reject unsupported report types and invalid/reversed report dates; add length-validated server-side audit filters for action, actor username and entity fields; JSON-encode all settings values so string settings remain readable by existing consumers.
- `cms_backendapp/serializers_admin.py`: Map audit resource fields to the actual `AuditLog.entity_type` and `entity_id` model fields.
- `cms_backendapp/tests.py`: Cover reset-password validation, report type/date rejection, audit field mapping/search/permissions, and string/numeric settings serialization, in addition to the existing A1/A2 test coverage.
- `docs/API_CONTRACT.md`: Record implemented report types, real settings keys, audit filters, and actual department/catalog/supplier/PO capabilities.

## Lab Technician Module (L1-L6)
- `cms_doctorapp/views.py`: Restrict lab status/result writes to Admin and Lab Tech; enforce ORDERED → SAMPLE_COLLECTED → PROCESSING → IN_PROGRESS transitions; require defined result values before completion; validate technician role/activity; derive result flags from catalog reference/critical ranges.
- `cms_labapp/views.py`: Scope Doctor result reads to the authenticated doctor's own orders.
- `cms_backendapp/views_admin.py`: Restrict the lab dashboard to Lab Tech/Admin and include IN_PROGRESS in the processing KPI.
- `cms_doctorapp/tests.py`, `cms_labapp/tests.py`: Cover valid/invalid lab transitions, result permissions, doctor result scoping, critical flags and lab dashboard role access.
- No schema change or migration was required. Existing order, result, catalog, bill and dashboard endpoints were reused.
