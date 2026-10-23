# Project Progress & Implementation Status

## Current Phase: Phase 1 (Backend API)
**Last Completed Step**: Step 2 (seed_demo [--reset] verification & loading)  
**Next Step**: Step 3 (Business rules with tests)

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

## Next Steps
- **Step 3**: Business rules with tests: appointment double-booking check with `select_for_update`, book-and-pay, consultation complete & lock + addendum, prescription FEFO dispense & stock ledger, lab order critical alert, IdSequence, AuditLog.
- **Step 4**: `docs/smoke_test.md`: curl/PowerShell commands and live validation.

