# Clinova Healthcare — Progress Tracker

Phase 1 (tokens, CSS, fonts, icons, placeholder images) is done. 
Phase 2 (foundation, local data layer, auth, shell components, login page, and placeholder dashboards) is done.
Phase 3 (Shared UI Components, Core APIs, Doctor Module, Receptionist Module) is done.
Phase 4 (Pharmacist Module, Lab Technician Module, Purchasing/Inventory) is done.
Phase 5 (Admin Module, Global Settings, Audit Log, and Dashboard Reports API) is done.
Phase 6 (Final Quality, Responsiveness, Alignment and Interaction Repair Pass) is done. This includes deterministic skeletons, responsive stacked cards for tables on mobile, print styling, fixed layout inline styles (using `.split`, `.data-table`, etc.), and verified broken routes (e.g., test-catalog). Furthermore, all internal data models have been normalized to use canonical schema types (e.g. `stockLedger` over `dispensingHistory`, schema-aligned purchase orders) and all Admin modules (Staff, Users, Departments, Settings, Suppliers, Reports) have been fully audited and repaired.
Phase 7 (Final Temporary Polish & Stabilization Pass) is done. This includes updating the visual palette to "Turquoise Harmony" (variables.css), fixing the logo branding & layout, solidifying settings, finalizing dashboard robustness via try-catch fallback rendering, calculating stock levels consistently from active batches rather than static variables, and performing layout validations across breakpoints.

## Files in `frontend/`

| Path | Purpose |
|------|---------|
| `index.html` | Entry point; redirects to login page |
| `assets/css/*` | Design tokens, layout, components, forms, utilities, etc. (Phase 1) |
| `assets/fonts/inter-variable.woff2` | Inter variable font |
| `assets/icons/sprite.svg` | Icon sprite |
| `assets/images/*` | Logos, avatars, and hero placeholder |
| `data/schema.js` | Database schemas and validation rules |
| `data/db.js` | LocalStorage database facade with transactional wrapper |
| `data/seed.js` | Deterministic demo data generator (departments, staff, patients, appts, etc.) |
| `core/session.js` | Session manager (30-min timeout, activity tracking) |
| `core/guard.js` | Route guard, role-based access control, dashboard redirection |
| `api/auth.js` | Authentication API (PBKDF2 hashing, lockout rules) |
| `api/patients.js` | API for patient registration, validation, and listing |
| `api/appointments.js` | API for booking, slot validation, check-in, and cancellation |
| `api/consultations.js` | API for clinical notes, locking, and addendas |
| `api/prescriptions.js` | API for prescribing meds, with built-in allergy checking |
| `api/laboratory.js` | API for ordering lab tests, result entry, and critical flagging |
| `api/pharmacy.js` | API for dispensing, inventory, suppliers, purchasing, and stock ledger |
| `api/billing.js` | API for processing payments and managing invoices |
| `api/admin.js` | API for managing staff, users, departments, lab pricing, audit logs, and settings |
| `api/reports.js` | Shared API for generating dashboard statistics across all roles and CSV exports |
| `components/sidebar.js` | Role-based navigation sidebar |
| `components/topbar.js` | Global topbar (search, notifications, user menu) |
| `components/app-shell.js` | App shell layout assembler |
| `components/ui.js` | Shared UI components: DataTable (responsive), Modal, Toast, Formatters, Badges |
| `pages/login/index.html` | Two-panel login page with demo accounts collapsible |
| `pages/shared/403.html` | Access denied page |
| `pages/shared/devtools.html` | Dev tools for data reset and diagnostics |
| `pages/shared/patient-profile.html` | Patient 360-view (Overview, Appts, Consults, Rx, Labs, Billing) |
| `pages/reception/dashboard.html` | Reception dashboard (powered by reports.js) |
| `pages/reception/patients.html` | Patient list & Registration Wizard |
| `pages/reception/appointments.html` | Appointment list & Booking Wizard (3-step) |
| `pages/reception/billing.html` | Billing list, Print Invoice, Payment Modal |
| `pages/doctor/dashboard.html` | Doctor dashboard (powered by reports.js) |
| `pages/doctor/patients.html` | Searchable patient directory |
| `pages/doctor/appointments.html` | Today's appointments with direct Consult action |
| `pages/doctor/consultation.html` | Clinical consultation screen (Notes, Rx Builder, Lab Order, Locking) |
| `pages/doctor/prescriptions.html` | My prescriptions list & cancel pending |
| `pages/doctor/lab-orders.html` | My lab orders list & results viewer |
| `pages/doctor/clinical-history.html` | Chronological timeline of patient events |
| `pages/pharmacy/dashboard.html` | Pharmacy dashboard (powered by reports.js) |
| `pages/pharmacy/prescription-queue.html` | Dispense queue, stock checking, and billing integration |
| `pages/pharmacy/inventory.html` | Medicine inventory list with stock badges |
| `pages/pharmacy/suppliers.html` | Supplier directory and management |
| `pages/pharmacy/purchases.html` | Purchase orders, PO creation, and stock receiving |
| `pages/pharmacy/stock-alerts.html` | Low stock and expiry alerts with 1-click PO |
| `pages/pharmacy/dispensing-history.html` | Log of past dispensed medicines |
| `pages/lab/dashboard.html` | Lab dashboard (powered by reports.js) |
| `pages/lab/test-queue.html` | Priority-sorted test queue with dynamic result entry |
| `pages/lab/completed-tests.html` | Completed tests and turnaround times |
| `pages/lab/results.html` | Finalized, printable lab reports |
| `pages/lab/catalog.html` | Read-only test catalog and reference ranges |
| `pages/admin/dashboard.html` | Admin dashboard with charts and system-wide alerts |
| `pages/admin/staff.html` | Staff management and doctor schedule editor |
| `pages/admin/users.html` | User account management (passwords, unlocks) |
| `pages/admin/departments.html` | Department listing and consultation fee editor |
| `pages/admin/lab-catalog.html` | Lab test pricing editor |
| `pages/admin/suppliers.html` | Read-only oversight of suppliers and purchase orders |
| `pages/admin/reports.html` | Date-range filtered reports with CSV export |
| `pages/admin/settings.html` | Global hospital settings and data management (export/reset) |
| `pages/admin/audit-log.html` | Searchable record of critical system actions |
| `docs/DECISIONS.md` | Architecture and design decisions |
| `docs/PROGRESS.md` | This file |
