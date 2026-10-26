# Late-arrival rebooking status and duplicate prevention

## Behavior

A successful Prior Booking late arrival that moves to a different slot now changes the original appointment to `REBOOKED` (Arrived Late (Rebooked)). Its doctor, date, time, historical token, invoice, payments, notes and existing No-show audit events remain intact. The replacement keeps its actual checked-in status and token.

The existing `LATE_ARRIVAL_REASSIGNED` audit event persists the original ID (`entity_id`), replacement ID (`details.replacementId`) and invoice (`details.billId`). No additional relationship table or appointment field is needed. The event is saved in the same transaction as the replacement and original status.

Check-in locks the patient, doctor and original appointment before checking this link. Retried Prior Booking requests return the linked replacement before allocating another slot or recording payment. This remains true if the replacement is later cancelled or otherwise changes status. A REBOOKED row without a valid link rejects processing for review instead of creating another visit.

The serializer returns `lateArrivalHandled` and `replacementAppointmentId`. React immediately updates the original cached row on success and refetches appointment lists. Refreshing/reopening the app retrieves this state from Django. The original row displays a blue badge and View New Booking, which fetches the existing replacement through a GET request and opens its details. A missing link displays a non-clickable Late Arrival Handled label. Failed requests do not update the cached row.

The released original slot remains released: availability excludes the new historical REBOOKED status, retaining all issued token numbers in the existing historical-token reservation set. No slot-generation or token-numbering algorithm changes were made.

## Migration

`cms_recepapp/migrations/0006_appointment_rebooked_status.py` contains the complete migration:

- Adds REBOOKED to the existing status choices.
- Backfills NO_SHOW Prior Bookings that already have a valid late-arrival audit link to a replacement for the same patient, doctor and date.
- Preserves audit, invoice and payment data. Unlinked No-shows and other statuses remain unchanged.
- A reverse migration restores REBOOKED Prior Bookings to NO_SHOW while retaining their links/history.

Apply before running the updated application:

```powershell
& .\back-end\myvirtualenv\Scripts\python.exe back-end/cms_proj/manage.py migrate
```

On 26 October 2026, the configured application database was inspected and migration 0006 was found unapplied. The targeted migration was then applied after verifying the existing replacement links; five original Prior Bookings were corrected to REBOOKED.

## Files changed for this fix

| File | Reason |
| --- | --- |
| `cms_recepapp/models.py` | Add the REBOOKED status choice. |
| `cms_recepapp/migrations/0006_appointment_rebooked_status.py` | Status migration and existing-link backfill. |
| `cms_recepapp/views.py` | Return the existing Prior Booking replacement on retry; set the original REBOOKED only inside successful rebooking transaction. |
| `cms_recepapp/serializers.py` | Expose durable handled state and replacement ID. |
| `cms_recepapp/services.py` | Treat REBOOKED as released history in the existing availability check. |
| `cms_recepapp/test_reporting.py` | Status, history, retry, legacy-link, migration and failure rollback coverage. |
| `cms_recepapp/tests.py` | Real concurrent MySQL late-arrival requests must produce one replacement/payment/token. |
| `frontend-react/src/components/Badge.jsx` | Map REBOOKED to the requested blue badge and label; other statuses unchanged. |
| `frontend-react/src/pages/reception/ReceptionAppointmentsPage.jsx` | Immediate row update, View New Booking details and status filter. |
| `frontend-react/src/pages/reception/RebookedAction.jsx` | Render a read-only replacement action for handled records. |
| `frontend-react/src/pages/reception/rebooking.test.js` | Rendered badge/action, reload-state and link-click regression tests. |
| `back-end/PRIOR_BOOKING_REPORTING.md` | Update the earlier workflow notes for REBOOKED and its migration. |
| `back-end/LATE_ARRIVAL_REBOOKING.md` | Migration, implementation and validation notes. |

Prior creation, reporting-window policy, fee rules, slot generation, token allocation and Walk-in booking code were left unchanged by this fix. Existing same-slot arrival handling remains unchanged; the new status applies when a replacement booking is created.
## Actual verification results

- Full receptionist SQLite suite: 80 tests run, passed with 5 row-locking tests skipped.
- Focused MySQL reporting/concurrency suite: 24 tests passed, no skips.
- Final MySQL checks after the last changes: 2 tests passed (simultaneous late rebooking and rollback after replacement save).
- Frontend rendered-action/badge and payment-mode tests: 5 passed.
- Frontend production build succeeded; lint exited successfully with existing warnings. Build reports the existing large-bundle warning.
- `makemigrations --check --dry-run`: no missing model migrations.

The MySQL concurrency test asserts identical replacement IDs/tokens in both responses, exactly one new appointment/payment, the original historical token unchanged, original REBOOKED status, and exactly one persistent late-arrival link.


## Follow-up: original rows still displaying No-show

Root cause: the application database had not applied the existing `0006_appointment_rebooked_status` migration. Five original Prior Bookings still had NO_SHOW in the database while their late-arrival audit links already supplied View New Booking. The endpoint, serializer, status label and blue badge mapping were already correct; no application source change was necessary.

The migration plan contained only 0006. Applying it corrected the five originals with matching replacement patient/doctor/date. A before/after comparison verified that every other appointment field, all 34 unlinked genuine No-shows, all 39 Walk-ins, replacement records, all tokens, invoices, invoice items, payments and audit history were unchanged. A fresh database connection confirmed all five saved statuses and serializer outputs remain REBOOKED.

The real React Badge and RebookedAction components were rendered against all five corrected serialized records: each displayed Arrived Late (Rebooked), used the primary blue badge, and invoked View New Booking with the saved replacement ID. All five frontend regression tests passed. Only this documentation file was modified for the follow-up; the correction applied the existing migration rather than rewriting any workflow.
The focused MySQL regression run also passed both tests: successful rebooking/history persistence and selective migration backfill.
