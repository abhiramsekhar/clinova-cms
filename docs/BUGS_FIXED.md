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
- Doctor dashboard tables now use the shared table styles and explicit columns, preventing appointment and lab columns from drifting; Doctor pages share scoped responsive styling.
- Admin dashboard now maps the actual backend KPI fields and its API endpoint explicitly rejects non-Admin roles; verified by the passing AdminDomainTests suite.
- Admin Staff placeholder is now backed by the paginated staff API, with validated account creation in one transaction, linked Doctor profiles, edit/deactivate actions and future-appointment protection; verified by AdminDomainTests and the React production build.
- Admin Users now reads all paginated accounts and wires the supported reset/unlock actions; password reset validates against Django's configured validators and is covered by AdminDomainTests.
- Admin Departments now uses paginated department data and supported create/edit fields; fee values convert between rupees and paise once, and the unsupported head-doctor write is not exposed.
- Admin Lab Catalog now reads actual catalog fields and supports legacy price-only edits with paise conversion; catalog add/deactivation controls are not exposed.
- Admin Suppliers now shows read-only supplier and purchase-order data with real filters and a detail view; supplier rate metadata is labeled accurately because the endpoint returns references, not unit prices.
- Admin Reports now offers only implemented report types, uses the actual response shape, validates date ranges, and exports safely escaped CSV; unsupported report types no longer fall through to appointment rows.
- Admin Settings now edits only known stored keys, parses mixed raw/JSON-encoded values, and sends only changed non-empty settings; the backend JSON-encodes string updates so existing settings consumers can read them.
- Admin Audit Log now serializes actual entity fields and supports validated server-side filters while keeping audit records read-only.
