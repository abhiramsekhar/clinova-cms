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
| D1 | Doctor Dashboard | IN PROGRESS | Doctor-scoped statistics and schedule; aligned responsive appointment/lab tables and polished KPI/header styling; browser verification pending |
| D2 | Doctor Appointments | IN PROGRESS | Authenticated-doctor, date-filtered API schedule with retryable states and shared Doctor page styling; browser verification pending |
| D3 | Doctor Patients | IN PROGRESS | Doctor-scoped searchable API directory, patient-profile navigation and shared Doctor page styling; browser verification pending |
| D4 | Doctor Consultation | IN PROGRESS | Existing authorized consultation record with shared Doctor page styling; interactive draft, prescription, lab-order, completion and addendum workflow remains outstanding; browser verification pending |
| D5 | Doctor Prescriptions | IN PROGRESS | Doctor-scoped API results, status filtering and shared Doctor page styling; creation, detail/print and cancellation actions remain outstanding; browser verification pending |
| D6 | Doctor Lab Orders | IN PROGRESS | Doctor-scoped API orders, status filtering, returned result/critical data and shared Doctor page styling; order/cancel actions remain outstanding; browser verification pending |
| D7 | Doctor Clinical History | IN PROGRESS | Scoped patient selection, API-backed timeline and shared Doctor page styling; browser verification pending |
| P1 | Pharmacy Dashboard | TODO | |
| P2 | Pharmacy Prescription Queue | TODO | |
| P3 | Pharmacy Inventory | TODO | |
| P4 | Pharmacy Purchases | TODO | |
| P5 | Pharmacy Suppliers | TODO | |
| P6 | Pharmacy Stock Alerts | TODO | |
| P7 | Pharmacy Dispensing History | TODO | |
| L1 | Lab Dashboard | IN PROGRESS | Preserved existing design; active queue now includes IN_PROGRESS and backend processing KPI counts PROCESSING + IN_PROGRESS; build/backend tests pass; live browser verification pending |
| L2 | Lab Test Queue | IN PROGRESS | Real paginated orders, search/status filters, STAT/URGENT/Routine sorting, collect/process/result actions and dynamic catalog-based result form; backend transitions and permissions enforced; build/backend tests pass; browser verification pending |
| L3 | Lab Completed Tests | IN PROGRESS | Completed orders require a saved result; date/priority/search filters, turnaround time, result details and print report; build/backend tests pass; browser verification pending |
| L4 | Lab Results | IN PROGRESS | Real result/order join, parameter values, units, catalog ranges/flags, date/type/status filters, result entry/edit and print via Completed Tests; verification state is unsupported; browser verification pending |
| L5 | Lab Catalog | IN PROGRESS | Real paginated catalog, search/details, Lab Tech test creation and range-only edits; new tests default to zero price and Admin remains responsible for billing price; backend permission tests and frontend build pass; browser verification pending |
| L6 | Lab Billing | IN PROGRESS | Real bill list filtered to LAB_TEST items, patient/invoice search, payment status, receipt details and print; LAB_TECH payment writes are blocked by backend permissions; browser verification pending |
| A1 | Admin Dashboard | IN PROGRESS | Maps the endpoint's six actual fields and formats paise once; endpoint explicitly Admin-only; verified by AdminDomainTests (Admin allowed, other roles denied) and React production build; live browser verification pending |
| A2 | Admin Staff | IN PROGRESS | API-backed paginated/filterable list and create/edit/deactivate workflows; creation atomically links a password-validated login and Doctor profile where applicable; 18 AdminDomainTests and React production build pass; live browser verification pending; legacy schedule editor awaits a supported API |
| A3 | Admin Users | IN PROGRESS | Uses paginated `/users/`, complete-dataset search/role/status filters, password-reset modal and confirmed unlock; reset API validates Django password policy; 21 AdminDomainTests and build pass; browser verification pending; account creation remains in A2 Staff |
| A4 | Admin Departments | IN PROGRESS | Paginated list, complete-dataset filters, create/edit for supported fields, fee paise conversion; head doctor shown read-only as backend serializer does not accept it; 21 AdminDomainTests and build pass; browser verification pending |
| A5 | Admin Lab Catalog | IN PROGRESS | Paginated catalog create/edit, search/category/status filters and price editing using paise; build pass; browser verification pending |
| A6 | Admin Suppliers | IN PROGRESS | Read-only supplier and PO oversight with real paginated APIs, supported search/status/supplier filters, supplier rates metadata and PO detail; endpoint does not provide unit-price rates; build pass; browser verification pending |
| A7 | Admin Reports | IN PROGRESS | Uses actual appointments/revenue/medicine response schemas, date validation, safe CSV export; unsupported outstanding/lab options are disabled and backend now returns 400; 21 AdminDomainTests and build pass; browser verification pending |
| A8 | Admin Settings | IN PROGRESS | Uses seeded clinic/appointment/registration-fee keys, parses raw/JSON values, saves only changed non-empty values and preserves other keys; backend JSON-encodes strings for existing settings consumers; string/numeric serialization is covered by the 21 passing AdminDomainTests; unsupported import/export/reset omitted; build pass; browser verification pending |
| A9 | Admin Audit Log | IN PROGRESS | Read-only backend pagination and server-side action/user/resource filters, correct entity field mappings, privacy-conscious metadata display; 21 AdminDomainTests and build pass; browser verification pending |
| S2 | Patient Profile (shared) | TODO | Initial API-backed profile route and overview/history tabs added for Reception navigation; full legacy parity, including standalone lab order, remains outstanding |
| S4 | DevTools | TODO | |
| S5 | Styleguide | TODO | |
