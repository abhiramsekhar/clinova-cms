# Bugs Fixed

> One-line entries. Updated as bugs are discovered and fixed during development.

<!-- Phase 0: none yet (read-only audit) -->
- Reception patient directory and billing API failures now display retryable error states instead of appearing empty.
- Reception dashboard now surfaces retryable errors for failed appointments and recent bills requests.
- Patient directory View now opens a protected API-backed profile route with the selected patient ID in an encoded query parameter.
- Patient registration now runs the backend precheck before payment and keeps server field/detail errors visible for correction.
- Reception global patient search and patient-directory filtering now use the server search endpoint instead of filtering only the default API page.
- Reception appointment slot lookup failures are no longer treated as empty availability; appointment errors now have retry states.
- Reception billing search now uses the backend search filter; Reception date filters now use the browser's local date.
- Shared React modals stayed hidden because they omitted the stylesheet's `is-open` class; modal and confirmation workflows now render as visible overlays.
- Appointment fee actions now resolve the serializer's `billId` with the bills API, read paise-valued `balanceDue`, allow bounded partial payments, and refresh affected Reception queries.
- Appointment list fee status now uses the serializer's `billStatus`; no-show requests now enforce the documented 15-minute grace period and have a backend regression test.
- Reception global search now includes API-backed appointment suggestions and carries the query into the server-filtered appointment list.
- Doctor dashboard metrics now match the legacy status definitions and are restricted to the authenticated doctor's patients, appointments, lab orders and prescriptions; the schedule uses today's API filter and the serializer's `time` field.
- Doctor dashboard appointment and statistics requests now show retryable errors instead of treating failed requests as empty data; consultation links appear only for checked-in or in-progress appointments.
- Doctor Patients, Appointments, Consultation Records, Prescriptions, Lab Orders, and Clinical History routes no longer render placeholder-only pages; they call the existing APIs, handle paginated results and expose retryable loading/error/empty states.
- Doctor read endpoints now enforce authenticated-doctor scope even when doctor filters are missing or altered; patient details/history and prescription/lab creation no longer allow cross-doctor access.
- Doctor lab and clinical-history views now use the serializers' actual camelCase and snake_case response fields; Doctor query cache keys include the authenticated staff identity to avoid cross-account cached data.
