# Project Progress & Implementation Status

## Current Phase: Phase 1 (Backend API)
**Last Completed Step**: 1a  
**Next Step**: 1b (New models + enum changes from GAP_REPORT + migrations; run migrate)

---

## Progress Log

### Step 1a (Completed)
- **Dependencies Installed**:
  - `djangorestframework==3.18.3`
  - `djangorestframework_simplejwt==5.5.1`
  - `django-cors-headers==4.9.0`
  - `PyJWT==2.15.1`
- **Requirements Frozen**: `back-end/requirements.txt` updated.
- **Environment & Settings Configured**:
  - `back-end/.env`: added `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.
  - `back-end/cms_proj/cms_proj/settings.py`:
    - Decoupled `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.
    - Added `rest_framework`, `rest_framework_simplejwt`, `corsheaders` to `INSTALLED_APPS`.
    - Added `corsheaders.middleware.CorsMiddleware` to `MIDDLEWARE`.
    - Configured `REST_FRAMEWORK` default authentication (`JWTAuthentication`), permission (`IsAuthenticated`), pagination (`PageNumberPagination`, page size 20).
    - Configured `SIMPLE_JWT` token lifetimes (access 60 min, refresh 24 hours).
- **Validation**: `python manage.py check` executed with 0 errors (1 expected MySQL warning regarding conditional unique constraint, to be handled in application layer).
- **Documentation**: Documented Staff <-> Doctor ID bridge and integer paise Money representation in `docs/API_CONTRACT.md`.

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

---

## Next Steps
- **1b**: Implement new models (Supplier, PurchaseOrder, StockLedgerEntry, Notification, AuditLog, Setting) and enum additions from `docs/GAP_REPORT.md` across apps, generate migrations, and run `python manage.py migrate`.
- **1c**: Auth endpoints (`login`, `me`, `refresh`, `logout`) + role-based permissions (`IsRole`).
- **1d**: Resource ViewSets, serializers, and URLs by domain (reception, doctor, pharmacy, lab, admin).
- **1e**: Business logic endpoints (book-and-pay, dispense, enter-result, consultation lock, double-booking prevention).
- **1f**: `seed_demo` command with `--reset` support.
- **1g**: Test suite + `docs/smoke_test.md`.
