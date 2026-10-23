# Clinic Management System (CMS) — Frontend

A five-role clinic workflow built with **plain HTML, CSS and JavaScript**. There is no backend: all data lives in the browser's `localStorage`, and all business rules run in a JavaScript service layer.

**Roles:** Admin · Receptionist · Doctor · Pharmacist · Lab Technician

---

## 1. Running the project

1. Unzip the folder.
2. Start it with **VS Code Live Server** (right-click `index.html` → *Open with Live Server*). The app now has many HTML pages, and serving them from one address (e.g. `http://127.0.0.1:5500`) guarantees they all share the same database. Double-clicking files can work in some browsers, but others treat every `file://` page as a separate origin, which makes data seem to vanish between pages.
3. Log in with a demo account.

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Doctor | `doctor` | `doc123` |
| Receptionist | `recep` | `rec123` |
| Pharmacist | `pharma` | `pha123` |
| Lab Technician | `lab` | `lab123` |

**Testing several roles at once:** the login session is stored per browser tab (`sessionStorage`), while data is shared across tabs (`localStorage`). Open one tab per role in the same browser, on the same address, to test cross-module flows.

**Resetting data:** Admin → Dashboard → *Reset demo data* (asks for confirmation, wipes everything, logs you out).

---

## 2. Project structure

Every screen is its own HTML file. Each role has its own folder holding its pages and one JS file; all pages share the same CSS and core scripts.

```
cms-frontend/
├── index.html                      Login page
├── css/theme.css                   ONE shared stylesheet (tokens + components)
├── js/
│   ├── core.js                     Storage, auth, validators, form/table/toast helpers, page boot
│   └── services.js                 All business rules (the only place data is changed)
├── admin/
│   ├── dashboard.html  staff-users.html  lab-catalog.html
│   └── admin.js
├── reception/
│   ├── patients.html  appointments.html  billing.html
│   └── reception.js
├── doctor/
│   ├── my-appointments.html  orders-results.html
│   └── doctor.js
├── pharmacy/
│   ├── prescription-queue.html  inventory.html
│   └── pharmacy.js
└── lab/
    ├── lab-queue.html
    └── lab.js
```

**How a page works.** Each HTML file is a small shell: it links `../css/theme.css`, loads `core.js`, `services.js` and its own module JS, then calls `CMS.boot('ROLE', screenIndex)`. `boot` checks the login, draws the sidebar and renders that screen from the module file. The sidebar links are ordinary links between the HTML files of the same folder.

**Adding a page.** Add the screen to the module's array in its JS file, then copy an existing HTML file in that folder and change the screen index and title. The sidebar link is generated from the screen's label (`Lab catalog` → `lab-catalog.html`), so name the file to match.

### Ownership and rules for the team

| Area | Owner | Rule |
|---|---|---|
| `js/core.js`, `js/services.js`, `css/theme.css` | Shared | Change only through a reviewed pull request |
| `admin/` | Admin member | Edit only your own folder |
| `reception/` | Receptionist member | same |
| `doctor/` | Doctor member | same |
| `pharmacy/` | Pharmacist member | same |
| `lab/` | Lab member | same |

Module files contain **screens only**. Any rule that decides whether data may change belongs in `services.js`.

---

## 3. Architecture

```
Screen (module file)  →  CMS.form / CMS.page helpers  →  Service (services.js)  →  CMS.tx  →  localStorage
```

- **Screens** build the UI and call services. They never write to storage directly.
- **`CMS.form`** builds a modal form, runs validators, shows inline errors, and calls a service. If the service throws, the message appears as an error toast and the form stays open.
- **`CMS.tx(fn)`** is the transaction wrapper. It snapshots the database, runs `fn`, saves on success, and **restores the snapshot and rethrows on any error**, so a failed operation never leaves half-written data.
- **`CMS.page`** renders a titled, searchable table with optional action buttons. Button clicks are routed through `data-a` / `data-id` attributes; a thrown error becomes a toast.
- **Role guard:** every page calls `CMS.boot(role, screen)`. With no active session (or a deactivated account) the visitor is sent to the login page. A logged-in user who opens a page belonging to another role (for example a pharmacist typing a doctor page's address) is redirected to their own home page. The menu comes only from the logged-in user's role.

### Storage

All data is one JSON object under the key `cms_db_v1`:

| Table | Contents |
|---|---|
| `users` | Login accounts (staff name, username, password, role, `is_active`) |
| `patients` | Registered patients |
| `appointments` | Bookings (doctor, patient, date, slot, status, diagnosis, notes) |
| `prescriptions` | One medicine per prescription, with quantity and dosage |
| `labOrders` | Ordered tests with status and result |
| `bills` | Bills with line items and amount paid |
| `medicines` | Inventory (stock, price, expiry, active flag) |
| `labCatalog` | Available lab tests and prices |
| `seq` | ID counters per prefix |

**ID formats:** `U0001` user · `P0001` patient · `A0001` appointment · `R0001` prescription · `L0001` lab order · `B0001` bill · `M0001` medicine · `T0001` lab test. IDs are never reused.

The theme choice is stored separately under `cms_t`.

**Design note:** the styling in `css/theme.css` loads the *Inter* and *Plus Jakarta Sans* fonts from Google Fonts, so an internet connection is needed to see them exactly; without it the browser falls back to a system font and everything still works.

### Where your data lives and how to see it

- **Location:** your browser's `localStorage`, under the key `cms_db_v1`, for the address the app is served from. There is no server and no file on disk.
- **Persistence:** everything you add survives page refreshes, navigating between pages, closing the tab and restarting the browser. It is lost only if you use *Reset demo data*, clear the site's data, or use a private/incognito window.
- **Per browser and per address:** a different browser, a different browser profile, another computer, or a different address (`127.0.0.1:5500` vs `localhost:5500` vs `file://`) has its own separate copy of the database.
- **Viewing it:** open DevTools (F12) → *Application* tab (Chrome/Edge) or *Storage* tab (Firefox) → *Local Storage* → your address → `cms_db_v1`. In the Console, `JSON.parse(localStorage.cms_db_v1)` shows all tables.
- **Backing up:** in the Console, `copy(localStorage.cms_db_v1)` copies the whole database to your clipboard; paste it into a text file. To restore, run `localStorage.cms_db_v1 = '<pasted text>'` and refresh.
- **Team work:** each teammate has their own local data. Everyone starts from the same seed data, and the code is shared through Git, so integration means merging code, not merging databases.

---

## 4. Shared behaviours

### Authentication
- Username and password are both required; otherwise the login form shows *"Enter username and password"*.
- Wrong credentials show *"Wrong username or password"*.
- A deactivated account shows *"This account is deactivated"* and cannot log in.
- *Log out* clears the session and returns to the login page.
- A page opened without a session redirects to login.

### Forms
- Every field is required unless marked optional (*no asterisk = optional*).
- Validation runs on submit. Errors appear under each field. The form only submits when all fields are valid.
- Text is trimmed before validation, so whitespace-only values count as empty.
- The **Save** button is disabled while a save is in progress, which prevents double submission.
- On success the modal closes, a "Saved" toast appears and the list refreshes. On a rule failure the modal stays open and the error is shown.

### Tables
- Every table has a live search box that filters rows by any visible text.
- Empty tables show a friendly message instead of a blank area.
- Destructive actions (cancel appointment, reset data) ask for confirmation.

### Theme and layout
- *Light / dark* toggle in the sidebar; the choice is remembered.
- The sidebar highlights the current screen; each menu entry is a normal link to that screen's HTML file.
- Responsive: the sidebar collapses into a top bar on narrow screens; tables scroll horizontally.

### Security-related behaviour
- All user-entered text is HTML-escaped before display.
- Passwords are stored as **plain text** in `localStorage`. This is acceptable for a frontend-only course demo and is **not** suitable for real use.

---

## 5. Validation rules (`CMS.V`)

| Validator | Rule | Error message |
|---|---|---|
| `name` | Starts with a letter; letters, spaces, `.` `'` `-` only; 2–60 chars | Use letters only (2–60 characters) |
| `phone` | Exactly 10 digits, first digit 6–9 | Enter a 10-digit mobile number starting 6–9 |
| `email` | Standard `text@domain.tld` shape (optional field) | Enter a valid email |
| `dob` | Not in the future; not before 1906 | Date of birth cannot be in the future / Age looks impossible |
| `future` | Today or later | Pick today or a later date |
| `pos` | Whole number above 0 | Enter a whole number above 0 |
| `money` | Number above 0, at most 2 decimals | Enter an amount above 0 |
| `user` | 4–20 chars, lowercase letters, digits, `_` | 4–20 lowercase letters, digits or _ |
| `pass` | At least 6 characters | At least 6 characters |
| `notPhone` | Emergency contact differs from patient phone | Must differ from patient phone |

Date fields also carry `min`/`max` attributes so the browser's date picker blocks invalid dates. Validators guide the user; the **service layer re-checks the rules that protect data integrity**.

---

## 6. Module behaviour

### 6.1 Admin

**Dashboard** shows: patients registered, scheduled appointments today, pending prescriptions, open lab tests (ordered or in progress), medicines that are low (<10) or expired, total collected, total outstanding. *Reset demo data* restores the seed data.

**Staff & users**
- *Add user*: full name, username, password, role (Doctor, Receptionist, Pharmacist, Lab Tech, Admin). Usernames must be unique (*"Username already taken"*).
- New doctors immediately appear in the receptionist's booking list.
- *Deactivate / Activate*: deactivated users cannot log in, and deactivated doctors cannot be booked. An admin **cannot deactivate their own account**.
- *Reset password*: sets a new password (minimum 6 characters).
- Users are never deleted, so historical records keep their names.

**Lab catalog**
- *Add test*: name and price. Duplicate names are rejected (case-insensitive).
- *Change price*: affects future lab bills only; already-billed items keep the price they were billed at.

### 6.2 Receptionist

**Patients**
- *Register patient* fields: full name, phone, email (optional), date of birth, gender, blood group, address, emergency contact phone, allergies (optional).
- Rejected: blank name, invalid phone/email, future or impossible date of birth, missing gender, blood group or address, emergency contact equal to the patient's phone.
- A patient with the same name (case-insensitive) **and** phone as an existing patient is rejected as a duplicate (*"This patient is already registered"*).
- Registration date is set automatically.

**Appointments**
- *Book appointment*: patient (active patients only), doctor (active doctors only), date, time slot.
- Slots are fixed at 30 minutes, from 09:00 to 16:30.
- Rules enforced when booking:
  1. Patient must exist and be active.
  2. Doctor must exist and be active.
  3. The date cannot be in the past.
  4. Today's slots that have already passed are rejected.
  5. A doctor cannot have two scheduled appointments at the same date and time.
  6. A patient cannot have two scheduled appointments at the same date and time.
- Booking automatically adds a **₹300 Consultation fee** to the patient's open bill.
- *Cancel* (with confirmation) works only on `SCHEDULED` appointments. It removes the unpaid consultation fee from the bill. If that bill already has payments, cancelling is refused (*"Fee already paid — refunds are not supported"*).
- Cancelled slots become free to rebook.

**Billing**
- Lists every bill: patient, itemised description, total, paid, due, status.
- *Record payment*: amount must be above 0 and **cannot exceed the balance due**. Partial payments are allowed.
- Status is calculated: `UNPAID` (nothing paid), `PARTIAL`, `PAID`.

### 6.3 Doctor

**My appointments** shows only the logged-in doctor's non-cancelled appointments, sorted by date and time, with the patient's allergies shown for safety.
- *Consult* (only on `SCHEDULED`): diagnosis (required) and notes (optional). Marks the appointment `COMPLETED`.
- *Prescribe* (only on `COMPLETED`): medicine, quantity (whole number > 0), dosage. Only active, non-expired medicines are offered, and the service re-checks this. Creates a `PENDING` prescription.
- *Order lab test* (only on `COMPLETED`): choose a test from the catalog. The same test cannot be ordered twice for the same appointment while the earlier order is not yet completed.

**Orders & results** lists the doctor's prescriptions (with status) and lab orders (with result and Normal/Abnormal flag once completed).

Doctors only ever see their own appointments and orders.

### 6.4 Pharmacist

**Prescription queue**
- Lists all prescriptions, pending ones first: patient, doctor, medicine and quantity, dosage, status.
- *Dispense* is a single all-or-nothing operation. It succeeds only if:
  1. The prescription is `PENDING`.
  2. The medicine is active.
  3. The medicine is not expired.
  4. Stock is at least the prescribed quantity (otherwise *"Only N in stock, M needed"*).
- On success: stock decreases, a line item (`price × quantity`) is added to the patient's open bill, and the prescription becomes `DISPENSED`. On any failure nothing changes.
- A dispensed prescription cannot be dispensed again.

**Inventory**
- *Add medicine*: name, opening stock (whole number > 0), price per unit, expiry date (today or later). Duplicate names are rejected.
- *Restock*: adds a positive whole number to stock.
- *Activate / Deactivate*: an inactive medicine can't be prescribed or dispensed, and history is preserved.
- Status badges: `IN STOCK`, `LOW` (stock below 10), `EXPIRED`, `INACTIVE`.

### 6.5 Lab Technician

**Lab queue** lists all lab orders, unfinished ones first: patient, test, ordering doctor, status, result.
- Status flow: `ORDERED` → *Start* → `IN_PROGRESS` → *Enter result* → `COMPLETED`.
- *Enter result*: findings (required) and flag Normal/Abnormal (required).
- A result can only be entered after the test has been started, and a completed order cannot be changed.
- Completing a test adds the test price (from the catalog at that moment) to the patient's open bill.

---

## 7. Status flows

| Entity | Allowed transitions |
|---|---|
| Appointment | `SCHEDULED` → `COMPLETED` (consult) · `SCHEDULED` → `CANCELLED` |
| Prescription | `PENDING` → `DISPENSED` |
| Lab order | `ORDERED` → `IN_PROGRESS` → `COMPLETED` |
| Bill (calculated) | `UNPAID` → `PARTIAL` → `PAID` |

Any other transition is rejected by the service layer with a clear message.

---

## 8. Billing rules

- Each patient has at most one **open** bill (any bill not fully `PAID`). New charges go on that bill; if the latest bill is fully paid, a new bill is created.
- Charges are added automatically by: booking (consultation ₹300), dispensing (medicine price × quantity), and lab completion (test price).
- Money is stored as numbers and rounded to 2 decimals on payment.

---

## 9. End-to-end workflow

```
Admin creates staff accounts and lab catalog
   ↓
Receptionist registers patient → books appointment (consultation fee billed)
   ↓
Doctor consults (appointment → COMPLETED)
   ├── Prescribes medicine ─→ Pharmacist dispenses (stock ↓, bill ↑)
   └── Orders lab test ─────→ Lab tech starts → enters result (bill ↑)
   ↓
Receptionist records payment (bill → PARTIAL / PAID)
   ↓
Doctor views prescriptions and lab results; Admin sees dashboard totals
```

---

## 10. Manual test checklist

**Login**
- [ ] Empty fields, wrong password, and a deactivated user each show the right message.
- [ ] Opening any module page directly while logged out redirects to login.
- [ ] A logged-in doctor opening a pharmacy or admin page address is bounced to the doctor home page.

**Patient registration**
- [ ] Blank/numeric name, 9-digit phone, phone starting with 5, bad email, future DOB, DOB before 1906 are all rejected.
- [ ] Emergency contact equal to patient phone is rejected.
- [ ] Registering the same name + phone twice is rejected.

**Appointments**
- [ ] Past date, passed slot today, doctor double-booking and patient double-booking are rejected.
- [ ] Cancelling frees the slot and removes the fee; cancelling after the fee was paid is refused.

**Consultation and orders**
- [ ] Prescribe/Lab buttons appear only after the consultation.
- [ ] Prescribing quantity `0`, `-1`, `2.5`, `abc` is rejected.
- [ ] Ordering the same open test twice is rejected.

**Pharmacy**
- [ ] Dispensing more than the stock is refused and stock/bill stay unchanged.
- [ ] Dispensing twice is refused.
- [ ] Deactivated or expired medicines can't be prescribed or dispensed.

**Lab**
- [ ] Entering a result before starting is impossible; after completion, no further changes.

**Billing**
- [ ] Payment of `0`, negative, more than due, or non-numeric is rejected.
- [ ] Partial payment shows `PARTIAL`; the remaining balance clears to `PAID`.

**Admin**
- [ ] Duplicate username rejected; own account cannot be deactivated.
- [ ] A new doctor can be booked immediately; a deactivated doctor disappears from booking.

**General**
- [ ] Refresh keeps all data. Dark mode persists. Resize to phone width and check layout.
- [ ] Type `<b>test</b>` into a name or note field: it must display as text, not bold.

---

## 11. Known limitations

- Data is per-browser; there is no sharing between computers.
- One medicine per prescription (prescribe again for more).
- No refunds, no editing or deleting of patients or appointments, no rescheduling (cancel and rebook).
- Passwords are stored in plain text.
- Clearing the browser's site data erases everything.

---

## 12. Moving to a real backend later

All data access is concentrated in `core.js` (`CMS.all/get/add/tx`) and `services.js`. To connect a Django REST API, keep the screens and validators, and replace the service functions' bodies with `fetch()` calls (making them `async`). Your Django models already share the same entities, and the rules in section 6 double as the backend's validation requirements.
