# PORT TRACKER — Clinova React Migration

| ID | Page | Status | Notes |
|----|------|--------|-------|
| F0 | API client + auth + session timeout | DONE | JWT client, 30m timeout + warning modal, error normalization |
| F1 | UI components | DONE | Modal, ConfirmDialog, DataTable, Toast, FormField, StatCard, Tabs, Wizard, PrintView, Avatar, Badge |
| F2 | Layout (sidebar/topbar/search/notifications) | DONE | Sidebar with role menus, Topbar with notifications dropdown and Cmd+K search |
| F3 | Shared helpers (Format, validators, print) | DONE | Format helpers (date, datetime, time, money, age, displayName), validators.js |
| S1 | Login | DONE | Collapsible demo accounts, attempt tracking ("N attempts remaining"), 5-attempt lock, role redirect |
| S3 | 403 Forbidden | DONE | Access denied page with shield icon, Go Back, and Role Dashboard/Login link |
| R1 | Reception Dashboard | IN PROGRESS | Dashboard shortcuts remain route-backed; shared modal visibility fixed; build and diff check pass; live/browser verification pending |
| R2 | Reception Patients | IN PROGRESS | Server precheck and validation errors; API-backed patient search; shared registration modal visibility fixed; registration payload matches backend contract but live failure cause remains unverified; browser verification pending |
| R3 | Reception Appointments | IN PROGRESS | Slot/list errors surfaced; appointment bill status/id now match serializer; bill details fetched for bounded partial fee collection; global search opens server-filtered appointment list; no-show enforces documented 15-minute grace; backend test added; live/browser verification pending |
| R4 | Reception Billing | IN PROGRESS | Invoice search uses backend filter; payment refreshes billing/dashboard queries; shared payment modal visibility fixed; build and diff check pass; live/browser verification pending |
| D1 | Doctor Dashboard | IN PROGRESS | Added doctor-scoped patients, today's pending/completed counts, pending lab list, retryable API error states and correct schedule actions; backend regression test added; browser verification pending |
| D2 | Doctor Appointments | IN PROGRESS | Replaced placeholder with authenticated-doctor, date-filtered API schedule and retryable loading/error/empty states; browser verification pending |
| D3 | Doctor Patients | IN PROGRESS | Replaced placeholder with doctor-scoped searchable API directory and patient-profile navigation; browser verification pending |
| D4 | Doctor Consultation | IN PROGRESS | Displays an existing authorized consultation record from its appointment/record route; interactive draft, prescription, lab-order, completion and addendum workflow remains outstanding; browser verification pending |
| D5 | Doctor Prescriptions | IN PROGRESS | Replaced placeholder with doctor-scoped API results and status filtering; creation, detail/print and cancellation actions remain outstanding; browser verification pending |
| D6 | Doctor Lab Orders | IN PROGRESS | Replaced placeholder with doctor-scoped API orders, status filtering and returned result/critical data; order/cancel actions remain outstanding; browser verification pending |
| D7 | Doctor Clinical History | IN PROGRESS | Replaced placeholder with scoped patient selection and API-backed consultation/prescription/lab timeline; browser verification pending |
| P1 | Pharmacy Dashboard | TODO | |
| P2 | Pharmacy Prescription Queue | TODO | |
| P3 | Pharmacy Inventory | TODO | |
| P4 | Pharmacy Purchases | TODO | |
| P5 | Pharmacy Suppliers | TODO | |
| P6 | Pharmacy Stock Alerts | TODO | |
| P7 | Pharmacy Dispensing History | TODO | |
| L1 | Lab Dashboard | TODO | |
| L2 | Lab Test Queue | TODO | |
| L3 | Lab Completed Tests | TODO | |
| L4 | Lab Results | TODO | |
| L5 | Lab Catalog | TODO | |
| L6 | Lab Billing | TODO | |
| A1 | Admin Dashboard | TODO | |
| A2 | Admin Staff | TODO | |
| A3 | Admin Users | TODO | |
| A4 | Admin Departments | TODO | |
| A5 | Admin Lab Catalog | TODO | |
| A6 | Admin Suppliers | TODO | |
| A7 | Admin Reports | TODO | |
| A8 | Admin Settings | TODO | |
| A9 | Admin Audit Log | TODO | |
| S2 | Patient Profile (shared) | TODO | Initial API-backed profile route and overview/history tabs added for Reception navigation; full legacy parity, including standalone lab order, remains outstanding |
| S4 | DevTools | TODO | |
| S5 | Styleguide | TODO | |
