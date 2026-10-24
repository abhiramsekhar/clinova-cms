# CLINOVA — AGENT PLAYBOOK (React port with full legacy parity)

Put this file at `D:\Final_Project\docs\AGENT_PLAYBOOK.md`. Any agent/model (Claude Opus, Gemini Flash/Pro) must read it fully before working, and re-read the "Protocol" and "Rules" sections at the start of every session.

## 1. Mission
The React app (`frontend-react/`) currently has login, shell and placeholder dashboards only. The legacy app (`front-end/frontend/`, plain HTML/JS on localStorage) has ALL the real functionality. Goal: rebuild every legacy page in React with **full feature parity**, running on the real Django REST API + MySQL, then improve it to a professional clinical-management standard. No localStorage for data (only JWT tokens and UI prefs).

Sources of truth (read only what the current page needs):
- Legacy UI behaviour: `front-end/frontend/pages/<role>/<page>.html` (logic is inline in a `<script type="module">`).
- Legacy business rules: `front-end/frontend/api/*.js` (patients, appointments, consultations, prescriptions, laboratory, pharmacy, billing, admin, reports, auth), `core/guard.js`, `core/session.js`, `data/schema.js`.
- Legacy look and components: `assets/css/*`, `components/{sidebar,topbar,ui,app-shell}.js`.
- Backend contract: `docs/API_CONTRACT.md`, `docs/smoke_test.md`, and the DRF code in `back-end/cms_proj`. The backend is the source of truth for data and rules.
- Money: API uses integer paise everywhere. Display with one formatter (₹, en-IN, ÷100).

## 2. Rules (token-efficient, never break)
1. Python only via `back-end\venv\Scripts\python.exe`. Never global pip/python.
2. Never dump or re-print whole files. Read legacy files in slices (`grep -n` for function names, then read just that range). Never read `api/pharmacy.js` (943 lines) whole.
3. ONE page per turn (a "unit"). After each unit: run `npm run build`, test against the live backend, `git add -A && git commit -m "<unit>"`, update `docs/PORT_TRACKER.md`, then continue to the next unit. Stop only when the tracker says the session budget is hit, something fails twice, or a decision needs the user.
4. Tests: run `manage.py test --failfast --noinput --keepdb` only when backend code changed, at most once per change. Never loop on a test command.
5. Do not delete or rewrite working code to "tidy up" outside the current unit. Small targeted edits only.
6. Do not invent features that are not in legacy or in section 7. Do not drop any legacy feature.
7. If a legacy feature needs an endpoint/field the backend lacks: add the minimum (model field + migration, serializer, view, permission, test) and note it in `docs/BACKEND_CHANGES.md`. Never edit old migration files.
8. Log every bug found/fixed in `docs/BUGS_FIXED.md` (one line). Anything skipped or partial goes to `docs/KNOWN_ISSUES.md` (one line, with the page name).
9. Keep replies under 10 lines. No long summaries.

## 3. Protocol (every session, in this order)
1. Read this playbook sections 2, 3, 5, 6 + `docs/PORT_TRACKER.md` (if it does not exist, create it from section 5 — one row per page, status `TODO`).
2. Pick the first `TODO` row in tracker order (or the row marked `IN PROGRESS`; inspect its partial work in git before continuing).
3. For that page: (a) read the legacy page and only the api functions it imports; (b) write a feature checklist for the page in the tracker row notes (buttons, modals, filters, validations, print views, empty/error states); (c) map each action to an endpoint from API_CONTRACT; (d) build the React page using the shared components; (e) test every checklist item against the real backend with the right demo user; (f) fix, commit, mark `DONE`.
4. A page is DONE only when: every legacy feature on that page works against the real API; loading/empty/error states exist; forms validate (same rules as legacy + server errors shown inline); destructive actions have a confirm; role guard works (wrong role gets 403 page); no console errors; mobile layout works (tables become stacked cards); `npm run build` passes.
5. Resume safety: if the previous session ended mid-page, keep the partial code, finish it, do not restart the page.

## 4. React architecture (build ONCE in unit F0–F3 before any page)
- `src/api/`: axios client (VITE_API_URL, JWT attach, refresh on 401, normalised error → `{message, fieldErrors}`), one module per resource returning promises; `src/hooks/` react-query hooks per resource (`usePatients`, `useCreateAppointment`, ... with cache invalidation).
- `src/components/ui/`: port legacy `ui.js` to React: `DataTable` (server pagination, sort, search, responsive stacked cards, row actions, empty/skeleton states), `Modal`, `ConfirmDialog`, `Toast` provider, `Badge` (status/payment/priority maps from legacy `Format.status/payment/priority`), `Format` helpers (date, datetime, time, money(paise), age, displayName), `Wizard` (multi-step), `FormField` (label, error, hint), `Tabs`, `StatCard`, `Chart` (small, no heavy lib; SVG/CSS or a tiny lib), `PrintView` (opens A4 print window with legacy print.css), `Avatar` (initials fallback).
- `src/components/layout/`: AppShell, Sidebar (role menus copied from legacy `components/sidebar.js` MENUS, same labels/order/icons), Topbar (global search per role, notifications dropdown with unread count + mark read, user menu, sidebar toggle/drawer) — port legacy `topbar.js` behaviour including doctor-scoped and admin search groups.
- `src/auth/`: AuthContext, ProtectedRoute(roles), 30-minute inactivity timeout with warning (legacy `session.js`), role-based redirect (legacy `guard.js`), 403 page.
- Styles: reuse legacy CSS files unchanged (`variables.css` Turquoise Harmony palette + glass theme). No UI framework.
- Forms: controlled components + a small `validators.js` port of legacy `core/validators.js`; server field errors mapped onto fields.
- Routing: one route per legacy page; same URL slugs (`/reception/patients`, ...).

## 5. Page inventory and tracker (legacy path → React route). Complexity: H/M/L (use Opus for H, Flash/Pro ok for M/L)
Foundation first: F0 api client+auth+session timeout, F1 ui components, F2 layout (sidebar/topbar/search/notifications), F3 shared helpers (Format, validators, print).

### Shared
| ID | Legacy page | Features to keep | C |
|---|---|---|---|
| S1 | login/index | username+password; demo-accounts collapsible; error text "N attempts remaining"; lock message after 5 failed attempts (5 min); redirect by role | M |
| S2 | shared/patient-profile | Patient 360 view with tabs Overview, Appointments, Consultations, Prescriptions, Labs, Billing; "Order Lab Test" standalone order modal (select test, priority, reason); role-aware actions | H |
| S3 | shared/403 | access denied page, Go Back | L |
| S4 | shared/devtools | admin-only: reset to seed data (calls backend `seed_demo --reset` endpoint if it exists, else hide), diagnostics. Keep only if an endpoint exists; otherwise log in KNOWN_ISSUES | L |
| S5 | shared/styleguide | skip; replace with a dev-only `/styleguide` route listing shared components | L |

### Reception
| ID | Page | Features to keep | C |
|---|---|---|---|
| R1 | reception/dashboard | stats from reports (today's appointments, checked-in, pending fees, collections), quick links | L |
| R2 | reception/patients | list+search+filters; **Register New Patient wizard**: name, DOB, gender, phone, blood group, address, allergies (comma list), guardian name/phone for minors; **registration fee collected at registration** (payment method) → MRN issued only with a PAID fee bill; "Registration Complete" screen with Book Appointment Now / Book Later | H |
| R3 | reception/appointments | list with date/doctor/status filters; **3-step Booking wizard** (patient → doctor+date+slot+visit type → fee/payment); slot availability; double-booking blocked with clear message; actions: Check In (token issued only after fee paid), Collect Fee modal (partial payments, balance), Cancel with reason, Mark No-show, Keep Appointment | H |
| R4 | reception/billing | list+filters by payment status; invoice view modal; Print Invoice; Receive Payment (amount ≤ balance, method); partial/full payment status | M |

### Doctor
| ID | Page | Features to keep | C |
|---|---|---|---|
| D1 | doctor/dashboard | stats from reports (today's patients, pending, completed, pending lab results) | L |
| D2 | doctor/appointments | today's appointments for this doctor; Consult button → consultation | M |
| D3 | doctor/patients | searchable directory (doctor-scoped) | L |
| D4 | doctor/consultation | patient banner with allergies; vitals (BP, pulse, SpO2, temp, weight, etc.); chief complaint; clinical notes; diagnosis; Save Draft; **Prescription Builder** (medicine search, dosage, frequency, duration, qty, instructions, add multiple) with **Allergy Warning modal** (block/override rules as legacy); **Order Lab Test** (search test, priority, clinical reason); **Complete & Lock** (confirm, then record read-only); **Add Addendum** after lock | H |
| D5 | doctor/prescriptions | my prescriptions list/filter; New Prescription modal (patient select + builder + allergy check); View details; Print (standalone A4 window); Cancel pending with reason | H |
| D6 | doctor/lab-orders | my lab orders list; View modal with results and reference ranges, critical flags | M |
| D7 | doctor/clinical-history | patient select + filter by type; chronological timeline of consultations/prescriptions/labs | M |

### Pharmacy
| ID | Page | Features to keep | C |
|---|---|---|---|
| P1 | pharmacy/dashboard | stats + alerts (low stock, expiring) | L |
| P2 | pharmacy/prescription-queue | queue of prescriptions; View details; **Dispense** with FEFO batch allocation, stock check, partial dispense; **Dispense & Bill** (amount, payment method/status, insurer, claim/policy no., transaction ref); **Reject** with reason | H |
| P3 | pharmacy/inventory | medicine list with stock badges; Add/Edit medicine (name, generic, category, form, strength, unit size, manufacturer, unit price, reorder level, max stock); Restock / Receive Stock (batch no., expiry, qty, PO, supplier) | H |
| P4 | pharmacy/purchases | purchase orders list; Create PO (supplier, order date, line items with medicine, qty, rate); PO details; Receive Stock / Process Receipt (partial receipts, batch+expiry) | H |
| P5 | pharmacy/suppliers | supplier CRUD (name, contact person, phone, email); Rates modal (per-medicine rate) | M |
| P6 | pharmacy/stock-alerts | low-stock and expiry alerts; 1-click PO creation | M |
| P7 | pharmacy/dispensing-history | log of dispensed medicines with filters | L |

### Lab
| ID | Page | Features to keep | C |
|---|---|---|---|
| L1 | lab/dashboard | stats from reports | L |
| L2 | lab/test-queue | priority-sorted queue (STAT/URGENT/ROUTINE); Collect Sample → Start Processing → Enter Result (dynamic fields per test with reference ranges and unit; auto critical/abnormal flag) → confirm → Complete | H |
| L3 | lab/completed-tests | completed list with turnaround times | L |
| L4 | lab/results | finalized printable lab report (Print Report) | M |
| L5 | lab/catalog | read-only test catalog, View Details with reference ranges | L |
| L6 | lab/billing | lab bills list; Receive Payment; Receipt; Print/Save as PDF | M |

### Admin
| ID | Page | Features to keep | C |
|---|---|---|---|
| A1 | admin/dashboard | charts + system-wide alerts + quick links | M |
| A2 | admin/staff | staff list; Add/Edit (name, email, role, department if doctor); Deactivate (blocked if the staff has open appointments → "Cannot Deactivate"); doctor Schedule editor (working days, start/end time, slot duration) | H |
| A3 | admin/users | user accounts list; Reset Password modal; Unlock locked accounts | M |
| A4 | admin/departments | list; edit consultation fee | L |
| A5 | admin/lab-catalog | list; edit test price | L |
| A6 | admin/suppliers | read-only suppliers + purchase orders oversight, PO view modal | L |
| A7 | admin/reports | report type + date range; tables; Export CSV | M |
| A8 | admin/settings | hospital name/tagline/address/phone/email; working hours; slot duration; default consultation fee; low-stock threshold; expiry alert days; session timeout; Save; Export Data / Import Data / Reset to System Data (danger confirms) — use backend endpoints, hide any that do not exist and log it | M |
| A9 | admin/audit-log | searchable/filterable audit trail with pagination | L |

Order of work: F0–F3 → S1, S3 → R1–R4 → D1–D7 → P1–P7 → L1–L6 → A1–A9 → S2, S4, S5. (S2 patient-profile reuses tabs from the other modules, so it goes last.)

## 6. Business rules that must survive the port (enforced by backend, mirrored in the UI)
- Auth: 5 failed attempts lock the account 5 min; show remaining attempts; 30-minute inactivity logout with warning; inactive users cannot log in.
- Patient: MRN issued only together with a PAID registration-fee bill; minors need guardian; allergies stored as a list.
- Appointment: slots from doctor schedule + settings slot duration; no double-booking; token only after consultation fee is paid; status flow SCHEDULED → CHECKED_IN → IN_PROGRESS → COMPLETED, or CANCELLED / NO_SHOW (cancel needs a reason).
- Consultation: draft → Complete & Lock (read-only) → addenda only; allergy check on every prescription line (block until the doctor overrides with a reason where legacy allowed it).
- Prescription: statuses PENDING / PARTIALLY_DISPENSED / DISPENSED / CANCELLED; only pending can be cancelled by the doctor.
- Pharmacy: FEFO dispensing, never dispense expired batches, stock ledger entry on every change, low-stock and expiry alerts from settings, PO receive updates stock and ledger.
- Lab: priority order STAT > URGENT > ROUTINE; result entry validates numeric ranges and auto-flags abnormal/critical; critical results raise a notification for the ordering doctor.
- Billing: partial payments allowed, payment ≤ balance, status UNPAID/PARTIAL/PAID/CANCELLED, cancel with refund rule as in backend.
- Audit log entry for sensitive actions (login lock, password reset, staff deactivate, price change, consultation lock, bill cancel, stock adjustments, settings change).

## 7. Professional clinical improvements (ONLY after all pages are DONE; list each in `docs/IMPROVEMENTS.md`; max one commit per item)
1. Patient safety: duplicate-patient warning on registration (same name+DOB+phone); allergy and basic interaction/duplicate-therapy hint in the prescription builder; abnormal vitals highlighting; critical lab banner on the doctor's dashboard and patient banner.
2. Workflow: live today's queue (token numbers, waiting time) on Reception and Doctor dashboards; auto-refresh every 30 s via react-query; keyboard shortcuts (/ to search, Esc closes modal); remember filters per page.
3. Records quality: consultation templates (common complaints), ICD-10 diagnosis search (small local list), follow-up date field and a "Follow-ups due" list.
4. Reports: appointment no-show rate, revenue by department/day, top medicines, lab turnaround; all with CSV export.
5. UX/accessibility: focus trap in modals, aria labels, visible focus rings, color-contrast pass, consistent empty states, skeleton loaders, toast + inline errors, 404 page.
6. Engineering: error boundary per route, route-level code splitting, query cache tuning, `.env.example`, root README run instructions, a smoke checklist `docs/QA_CHECKLIST.md`.

## 8. Backend gaps protocol
When a page needs something the API lacks: (1) confirm in `docs/API_CONTRACT.md` and the serializer that it is really missing; (2) add the smallest change with a test; (3) update API_CONTRACT.md; (4) record it in BACKEND_CHANGES.md. Never change money units, ID formats or existing field names without updating both sides and the tests.

## 9. Model hand-off (Opus ⇄ Gemini Flash/Pro)
Opus has a small budget: spend it on H-complexity units and on F0–F3. Flash/Pro: M and L units. All state lives in `docs/PORT_TRACKER.md` + git; never rely on chat memory. A new model must: read sections 2, 3, 5 (its next row), 6; run `git log --oneline -5` and `git status`; then continue. If the tree is dirty, finish or discard only the unit marked IN PROGRESS.
