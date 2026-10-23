# Project Progress & Implementation Status

## Current Phase: Phase 1 (Backend API)
**Last Completed Step**: Step 4 (docs/smoke_test.md & live validation against runserver - all 48 tests passing)  
**Next Step**: Frontend integration & full-stack end-to-end verification

---

## Progress Log

### Step 1a (Completed)
- **Dependencies Installed**: `djangorestframework`, `djangorestframework_simplejwt`, `django-cors-headers`.
- **Requirements Frozen**: `back-end/requirements.txt` updated.
- **Environment & Settings Configured**: Decoupled config for SECRET_KEY, DEBUG, ALLOWED_HOSTS, CORS; configured DRF + SimpleJWT defaults.
- **Validation**: `python manage.py check` executed with 0 errors.

### Step 1c (Completed)
- **Custom JWT Authentication**: Created `CustomJWTAuthentication` in `cms_backendapp/authentication.py`, resolving users from the project's `users` table (`cms_backendapp.models.User`). Added `id`, `is_authenticated`, `is_anonymous` properties to `User`.
- **Role Permission System**: Created `IsRole` in `cms_backendapp/permissions.py` matching frontend `guard.js` roles (`ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PHARMACIST`, `LAB_TECH`), supporting direct instance and class-level usage.
- **Auth Endpoints Implemented**:
  - `POST /api/auth/login/`: Validates credentials with `check_password`, checks account lockout and inactive flags, returns access+refresh tokens and canonical `{ id, name, role, staffId, staffName, avatarUrl, departmentId }` user payload.
  - `GET /api/auth/me/`: Returns authenticated user profile.
  - `POST /api/auth/refresh/`: Refreshes access token.
  - `POST /api/auth/logout/`: Client-side token discard returning HTTP 204 No Content.
- **Routing**: Mounted auth routes under `/api/auth/` in `cms_proj/urls.py` via `cms_backendapp/urls.py` & `urls_auth.py`.
- **Automated Tests**: Implemented comprehensive test suite in `cms_backendapp/tests.py` (9 tests covering login success, bad password, non-existent user, inactive account, authenticated/unauthenticated /me, token refresh, logout, and role 401/403/200 permission enforcement). All 9 passed (0 errors).

### Step 1f (Completed)
- **Schema Alignment**: Added all missing models and fields from `docs/GAP_REPORT.md` across project apps (`Supplier`, `PurchaseOrder`, `StockLedgerEntry`, `Notification`, `Setting`, `AuditLog`, plus missing fields on `Department`, `Staff`, `User`, `LabTestCatalog`, `Medicine`, `ConsultationRecord`, `Prescription`, `LabTest`, `Patient`, `Appointment`, `Bill`, `Payment`).
- **Migrations Generated & Applied**: Generated new migration files for `cms_backendapp`, `cms_doctorapp`, `cms_labapp`, `cms_pharmapp`, `cms_recepapp` without modifying any `0001_initial.py` files. Applied via `python manage.py migrate`.
- **Command Created**: Implemented `python manage.py seed_demo [--reset]` in `cms_backendapp/management/commands/seed_demo.py`.
  - `--reset`: Clears only the 24 application tables (never `auth_*` or `django_*` tables), then loads all entities from `seed.js`.
  - Without `--reset`: Adds missing rows idempotently.
  - Generates Django-hashed passwords using `make_password`.
  - Preserves exact frontend ID schemes (`dept-01`, `staff-doc-01`, `pat-01`, `appt-001`, `med-01`, `test-01`, etc.).
  - Successfully seeded and verified: 5 roles, 6 departments, 14 staff, 7 doctors, 14 users, 24 patients, 45 appointments, 19 consultations, 28 medicines, 26 prescriptions (37 items), 4 suppliers, 6 purchase orders, 5 stock ledger entries, 12 lab catalog tests, 30 lab orders (18 results), 10 bills (26 items), 8 payments, 8 notifications, 8 settings.
  - Prints clean demo login credentials table.
- **Verification**: Ran `manage.py test cms_backendapp` with all 9 tests passing (0 errors).

### Step 1d-reception (Completed)
- **Services & Logic**: Created `cms_recepapp/services.py` for slot board calculations, walk-in slot finding, consultation and registration fee resolution from DB settings and doctor/department records.
- **Serializers**: Implemented `PatientSerializer`, `AppointmentSerializer`, `BillSerializer`, `BillItemSerializer`, and `PaymentSerializer` in `cms_recepapp/serializers.py`:
  - Enforced integer paise for wire amounts (`totalAmount`, `paidAmount`, `balanceDue`, `amount`).
  - Seamless `GenderField` supporting `"Male"`/`"Female"` frontend format and `"M"`/`"F"` backend storage.
  - Under-18 guardian validation, duplicate checks, and sequential MRN / ID generation.
  - Staff <-> Doctor ID bridge mapping (`doctorId` matches `staff_id`, e.g. `staff-doc-01`).
- **ViewSets**: Built `PatientViewSet`, `AppointmentViewSet`, `BillViewSet`, `PaymentViewSet` in `cms_recepapp/views.py`:
  - Query optimization via `select_related('patient', 'doctor__staff', 'department')` and `prefetch_related('bills', 'items', 'payments')`.
  - Search and filtering for name, MRN, phone, doctor, date, and status.
  - Actions: `precheck`, `register-and-pay`, `clinical-history`, `slot-board`, `next-walkin-slot`, `consultation-fee`, `book-and-pay`, `check-in`, `cancel`, `no-show`, `update-status`, `receive-payment`, `payments`.
- **Routing**: Configured `cms_recepapp/urls.py` with DRF `DefaultRouter` and connected to `/api/` in `cms_proj/urls.py`.
- **Automated Tests**: Implemented 14 tests in `cms_recepapp/tests.py` covering all reception operations, permissions, paise conversions, and ID mappings. Ran and verified: 14 passed (0 errors, 0 failures).

### Step 1 (Completed): API tests for 1d groups (reception, doctor, pharmacy, lab, admin)
- **Doctor Domain (`cms_doctorapp`)**:
  - Implemented `DoctorSerializer`, `ConsultationRecordSerializer`, `PrescriptionSerializer`, `PrescriptionItemSerializer`, `LabOrderSerializer`.
  - Built `DoctorViewSet`, `ConsultationViewSet` (get-or-create, save-draft, complete, addendum), `PrescriptionViewSet` (create with allergy check, cancel, dispense with FEFO batch deduction, StockLedgerEntry, bill/payment creation, reject), `LabOrderViewSet` (create, cancel, update-status, enter-result with critical range notifications).
  - Wired URLs to `/api/` and added 5 automated tests in `cms_doctorapp/tests.py`.
- **Pharmacy Domain (`cms_pharmapp`)**:
  - Implemented `MedicineSerializer` (paise conversion, computed stockLevel), `SupplierSerializer`, `PurchaseOrderSerializer`, `StockLedgerEntrySerializer`.
  - Built `MedicineViewSet` (toggle-active, restock, stock-alerts), `SupplierViewSet` (rates), `PurchaseOrderViewSet` (receive), `StockLedgerViewSet`.
  - Wired URLs to `/api/` and added 5 automated tests in `cms_pharmapp/tests.py`.
- **Lab Domain (`cms_labapp`)**:
  - Implemented `LabCatalogSerializer` (paise conversion), `LabResultSerializer`.
  - Built `LabCatalogViewSet`, `LabResultViewSet`.
  - Wired URLs to `/api/` and added 3 automated tests in `cms_labapp/tests.py`.
- **Admin Domain (`cms_backendapp`)**:
  - Implemented `UserSerializer`, `StaffSerializer`, `DepartmentSerializer`, `SettingSerializer`, `AuditLogSerializer`, `NotificationSerializer`.
  - Built `UserViewSet` (reset-password, unlock), `StaffViewSet` (doctors dropdown, deactivate), `DepartmentViewSet`, `SettingViewSet`, `AuditLogViewSet`, `NotificationViewSet` (read, mark-all-read), `DashboardViewSet` (admin, doctor, reception, pharmacy, lab KPIs), `ReportViewSet` (generate).
  - Added 7 admin domain automated tests to `cms_backendapp/tests.py` (total 16 tests in cms_backendapp).
- **Test Suite Verification**:
  - Ran `manage.py test` across all apps: 43 tests executed and passed (0 errors, 0 failures).
  - Validated list/create/retrieve/update for allowed roles, 403 for other roles, 401 unauthenticated, and money as integer paise.

### Step 2 (Completed): seed_demo [--reset]
- **Verification & Execution**: Verified `python manage.py seed_demo --reset` and idempotent `python manage.py seed_demo`.
- **Table Integrity**: Verified `--reset` truncates only the 24 application tables (never touches `auth_*` or `django_*`).
- **Entity Coverage**: Complete set of entities from `seed.js` loaded with exact frontend ID schemes and Django-hashed passwords.
- **Credential Summary**: Correctly outputs demo logins table for all 5 roles.

### Step 3 (Completed): Business rules with tests
- **Appointment Double-Booking Check**:
  - Implemented in `AppointmentSerializer.validate` and `AppointmentViewSet.book_and_pay` using `Appointment.objects.select_for_update()` inside `transaction.atomic()`, checking `status__in=["SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"]`.
  - Excluded `CANCELLED` and `NO_SHOW` appointments from blocking slots.
- **Book-and-Pay & Patient Register-and-Pay**:
  - Atomic transaction handling appointment creation, PAID consultation bill, payment record, and bill items.
- **Consultation Complete & Lock + Addendum**:
  - `complete` action sets `is_completed=True`, timestamps completion, transitions `Appointment.status` to `COMPLETED`.
  - `addendum` enforces that notes can only be appended after consultation lock.
- **Prescription Dispensing**:
  - FEFO batch deduction logic in `PrescriptionViewSet.dispense`.
  - Creates negative `StockLedgerEntry` for tracking.
  - Distinguishes between full dispense (`DISPENSED`) and partial dispense (`PARTIALLY_DISPENSED`) when stock is insufficient.
  - Automatically creates paid/unpaid pharmacy bills and payments.
- **Lab Order Lifecycle**:
  - Transitions through `ORDERED` -> `SAMPLE_COLLECTED` -> `PROCESSING` -> `COMPLETED`.
  - `enter-result` automatically evaluates critical ranges on parameters and generates high-priority notifications for the attending doctor.
- **Bill Totals, Payments, and Cancellation**:
  - Added `@action cancel` on `BillViewSet` with automatic refund payment creation for previously collected sums.
  - `receive-payment` validates against remaining balance due in paise.
- **Sequential IdSequence Minting**:
  - Verified `generate_prefixed_id` increments `IdSequence` atomically under database lock.
- **Centralized Audit Logging**:
  - Created `cms_backendapp/audit.py` with `log_audit()`.
  - Instrumenting sensitive actions: appointment cancellation/no-show, bill cancellation, payment receipt, prescription cancellation/dispensation, consultation completion, user password reset, account unlocking, and staff deactivation.
- **Test Suite Verification**:
  - Ran full test suite across all apps: 48 tests executed and passed (0 errors, 0 failures).

### Step 4 (Completed): docs/smoke_test.md & Live Smoke Test Validation
- **Documentation**: Created `docs/smoke_test.md` containing complete ready-to-run curl and PowerShell commands for authentication and each resource group (Auth, Admin, Reception, Doctor, Pharmacy, Lab).
- **Live Server Testing**:
  - Ran automated PowerShell script against Django live server (`http://127.0.0.1:8000/api`).
  - Successfully verified:
    1. `POST /api/auth/login/` (Status: 200 OK, JWT tokens generated for admin).
    2. `GET /api/auth/me/` (Status: 200 OK, User profile retrieved).
    3. `GET /api/dashboard/admin/` (Status: 200 OK, Staff=13, Active Doctors=6, Appointments Today=10).
    4. `GET /api/patients/?search=Arun` (Status: 200 OK, Arun Nair, MRN: CLN-2025-0001).
    5. `GET /api/doctors/` (Status: 200 OK, Dr. Anil Kumar, fee=70000 paise).
    6. `GET /api/medicines/stock-alerts/` (Status: 200 OK).
    7. `GET /api/lab-catalog/` (Status: 200 OK, Blood Glucose, price=15000 paise).
- **Backend Enhancements**: Added `activeDoctors` KPI to `admin_dashboard` and `testName` alias to `LabCatalogSerializer`.
- **Test Suite Verification**: Ran full test suite across all apps: 48 tests passed (0 errors, 0 failures).

---

## Architectural Decisions & Invariants
1. **Source of Truth for Data**: `front-end/frontend/data/seed.js` is the source of truth for all entities. `python manage.py seed_demo --reset` will clear app tables only (never `auth_*` or `django_*`) and load all seed data preserving frontend ID schemes.
2. **Staff <-> Doctor ID Bridge**:
   - Frontend and external APIs communicate using `doctorId` matching `Staff.staff_id` (e.g., `staff-doc-01`).
   - Serializers map `staff_id` to `Doctor.doctor_id` internally.
3. **Money**:
   - API endpoints exchange monetary values as integer paise (`1 INR = 100 paise`).
   - Database stores `DecimalField(max_digits=10, decimal_places=2)`.
   - Conversions performed strictly in DRF serializers.
4. **Model Modifications**:
   - All new model fields must have `default=` or `null=True`.
   - No modifications to existing `0001_initial.py` migrations; all changes in new migration files.
5. **Auth Logout Strategy**: Client-side token discard returning HTTP 204 No Content.

---

### Phase 2 (Completed): Modern React Frontend (`frontend-react`)
- **Scaffolded Application**: Initialized `frontend-react` with Vite + React, React Router v7, Axios, and TanStack React Query v5.
- **Ported Design System**: Transferred legacy CSS architecture (variables, glassmorphism theme, typography, forms, tables, layouts, responsive overrides) into `src/styles/` with self-hosted Inter variable font and SVG icon sprites.
- **Authentication & Security (`src/auth`)**:
  - Implemented `AuthContext` with JWT access/refresh token persistence in localStorage and automatic `/api/auth/me/` session validation.
  - Implemented `ProtectedRoute` enforcing role permissions matching `guard.js` (`ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PHARMACIST`, `LAB_TECH`), auto-redirecting unauthenticated users to `/login` and unauthorized roles to `/403`.
- **API Client (`src/api`)**:
  - Configured Axios instance with `VITE_API_URL` (defaulting to `http://127.0.0.1:8000/api`) and added `.env.example`.
  - Implemented Bearer token injection and concurrent mutexed token refreshing queue on 401 Unauthorized responses via `/api/auth/refresh/`.
- **UI Components & Layout (`src/components`)**:
  - Created `AppShell` with collapsible/responsive sidebar, header topbar with user avatar, name, role badge, and logout dropdown.
  - Built `Icon`, `Badge`, `LoadingState`, `EmptyState`, and `ErrorState` components.
  - Implemented Toast notification system via `ToastContext`.
  - Added money format helper `formatPaise(paise)` converting integer paise into formatted INR currency.
- **Role Routing & Dashboards (`src/pages`)**:
  - `LoginPage`: Polished split-panel layout with quick demo login buttons for all 5 roles (`admin`, `dr.sarah`, `reception1`, `pharmacy1`, `lab1`), error banners, and post-login role redirection.
  - `ForbiddenPage`: Glass styled 403 access denied page.
  - Role dashboards connecting to live backend endpoints: Admin (`/dashboard/admin/`), Doctor (`/dashboard/doctor/`), Reception (`/dashboard/reception/`), Pharmacy (`/dashboard/pharmacy/`), and Lab (`/dashboard/lab/`).
  - Implemented secondary module pages across all 5 roles matching legacy navigation.
- **Validation**:
  - `npm run build` passes cleanly with 0 errors.
  - Verified authentication and role resolution against live Django backend for all 5 demo users.

---

## Status: Phase 1 & Phase 2 Completed Successfully
Backend API (Phase 1) and React Frontend (Phase 2) are fully implemented, connected, and verified against the live API.

