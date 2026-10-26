# Prior booking reporting workflow

## Files and design

- `cms_recepapp/services.py`: configurable reporting windows; idempotent missed-reporting processing under doctor/appointment locks; availability excludes CANCELLED, NO_SHOW and REBOOKED; historical token numbers remain reserved. Unpaid reservation previews also reserve distinct candidate token values within the board calculation.
- `cms_recepapp/views.py`: future reservations create no bill/payment/token; reporting validates arrival, registration verification, availability, saved payment totals and full balance before check-in/token confirmation; late reassignment preserves the original visit and invoice through an atomic audit link; cancellation retains payment state and is idempotent.
- `cms_recepapp/serializers.py`: reporting timestamps, explicit `tokenConfirmed`, and invoice lookup for a replacement visit through its original reservation's audit link.
- `cms_recepapp/tests.py`: updates old immediate-payment/permanently-blocked-slot expectations; retains existing walk-in, billing and permission tests; adds concurrent reporting validation.
- `cms_recepapp/test_reporting.py`: reservation boundaries, reporting, retries, doctor fees, registration, release, walk-in reuse, late reassignment, cancellation, history and payment-failure tests.
- `cms_proj/reporting_test_settings.py`: optional isolated in-memory SQLite settings for fast local tests. Concurrency validation requires MySQL.

The late-arrival status follow-up adds `REBOOKED` (Arrived Late (Rebooked)) and requires migration `0006_appointment_rebooked_status`. Existing audit links track the replacement and retain the No-show event history. See `LATE_ARRIVAL_REBOOKING.md` for migration and verification details.

The current Doctor model has no per-doctor working-hours or leave schedule. Availability therefore validates active doctor, active/bookable department, configured clinic hours, generated slot and competing appointments, using the existing scheduling mechanism.

## Reporting policy

Settings are read from the existing Setting table:

| Key | Default | Meaning |
| --- | --- | --- |
| `appointment.reportingStartMinutes` | 30 | Minutes before consultation when reporting opens |
| `appointment.reportingDeadlineMinutes` | 15 | Minutes before consultation when reporting closes |

For 10:00, reporting is allowed from 09:30 through 09:45 inclusive. After 09:45, an unreported prior reservation becomes NO_SHOW and releases the slot. This never checks anyone in or collects money. Availability reads, appointment listing and the existing `process_no_shows` worker invoke the same idempotent service. The old `appointment.noShowGraceMinutes` rule is superseded by the reporting deadline.

Only slots whose start has not passed are eligible for reuse. An issued historical token is never reused for a different appointment. Slot-position numbering remains the starting point; conflicting historical numbers are skipped, as in the existing allocator. Tokens shown on a slot board are candidates; `tokenNumber` on a newly reserved appointment remains null.

## API contract

Existing URLs remain registered by the DRF router; no URL changes are needed.

### Reserve a future visit

POST `/api/appointments/book-and-pay/`

```json
{
  "patientId": "pat-01",
  "doctorId": "staff-doc-01",
  "mode": "PRIOR",
  "date": "2026-10-27",
  "time": "10:00"
}
```

Date must be tomorrow through 28 days ahead inclusive, relative to the clinic timezone. Response is `{ "appointment": {...}, "bill": null }`; appointment status is SCHEDULED and tokenNumber is null. Payment information is unnecessary and no supplied payment is recorded for this reservation.

### Report, pay and confirm check-in

POST `/api/appointments/{id}/check-in/` (receptionist/admin)

```json
{
  "arrivalConfirmed": true,
  "registrationVerified": true,
  "expectedTotal": 70000,
  "payment": {
    "confirmed": true,
    "method": "CASH",
    "transactionRef": "optional-receipt-reference"
  }
}
```

Amounts are integer paise. `expectedTotal` must equal the outstanding balance; a mismatch returns QUOTE_CHANGED with the amount requiring review. For a new invoice, consultation comes from the doctor's existing configured-fee resolver, and registration is added only when due. `/booking-quote/` provides the current fee quote. For an existing partially paid invoice, use its remaining balance. Existing successful payment records remain intact, and a fully paid invoice is not charged again.

This uses the existing payment-recording workflow (confirmed CASH/CARD/UPI receipts); it does not introduce a payment gateway. New payment records, invoice creation, check-in and token confirmation commit together. Missing saved payments, failed payment recording or validation errors roll back new writes.

A successful retry returns the already checked-in appointment without another bill, charge or token.

### Late arrival

Use the same check-in endpoint. If the original slot is still eligible, it is offered first; otherwise the earliest eligible free slot is offered. An unconfirmed or changed choice returns SLOT_REVIEW_REQUIRED with `time`. Staff must review and resend the exact `time` with the reporting/payment fields. Availability is checked again while holding the doctor lock.

When the time changes, a new checked-in appointment is created. The original becomes REBOOKED with its time, historical token and No-show audit history intact. Its invoice/payment history remains attached to the original; the LATE_ARRIVAL_REASSIGNED audit event links the replacement and invoice. Both appointments' notes record the relationship. Serialized replacement visits expose the original bill ID/status, and token printing validates that bill. Retrying the original reporting request returns the same replacement.

The legacy `/undo-no-show/` endpoint returns REPORT_REQUIRED and directs callers to the guarded reporting flow; it cannot restore a released slot without availability/payment checks.

### Cancel

POST `/api/appointments/{id}/cancel/` with a nonempty `reason`. Eligible appointments become CANCELLED and release future slots. Repeating cancellation succeeds without another audit event. Appointment cancellation leaves invoices, payments and historical token numbers unchanged; explicit bill refund functionality remains a separate operation.

### Frontend integration

Prior creation must accept `bill: null`. Reporting UI must collect physical-arrival and registration-verification confirmations, show the current outstanding fees, and call check-in with payment confirmation. Late-arrival UI must review SLOT_REVIEW_REQUIRED before resubmission. Use `reportingStartsAt`, `reportingDeadlineAt` and `tokenConfirmed` from appointment responses. The receptionist wizard now implements these controls: Prior Booking has a reservation summary and confirmation button with no payment controls or issued-token display. Today's scheduled visits expose Report & Pay; missed visits expose Report Late Arrival. The reporting dialog reviews new-patient registration plus consultation, or consultation only when registration is already paid.

## Validation

From the repository root in PowerShell:

```powershell
$env:DJANGO_DEBUG='false'
& .\back-end\myvirtualenv\Scripts\python.exe back-end/cms_proj/manage.py test cms_recepapp --noinput
& .\back-end\myvirtualenv\Scripts\python.exe back-end/cms_proj/manage.py makemigrations --check --dry-run
```

The full configured-MySQL receptionist run passed 70 tests with no skips. The final targeted MySQL run passed all 17 tests, covering the added payment-integrity cases and all concurrency tests. SQLite previously passed 64 tests with three row-locking tests skipped; MySQL is the concurrency evidence.


## Frontend follow-up changes

- `frontend-react/src/pages/reception/ReceptionAppointmentsPage.jsx`: conditional wizard summary, reservation-only success view, dynamic reporting window and reporting/payment dialog for existing visits.
- `frontend-react/src/pages/reception/bookingPayment.js`: Walk-in-only payment controls and mode-specific request payment fields.
- `frontend-react/src/pages/reception/bookingPayment.test.js`: rendered controls and submitted payment-field regression tests.
- `frontend-react/src/api/resources.js`: check-in accepts the reporting payload.
- `cms_recepapp/views.py`: quote returns backend-calculated reporting timestamps and an existing visit's outstanding balance.
- `cms_recepapp/test_reporting.py`: dynamic fee/window quote and existing-balance coverage.

Follow-up verification: 15 focused Django reporting tests passed on MySQL; 6 Node tests passed (2 payment-mode tests and 4 existing utility tests); production frontend build succeeded; frontend lint exited successfully with existing warnings. New patients owe unpaid registration plus consultation; returning patients whose registration is already paid owe consultation only. Prior Booking collects neither at reservation time.
