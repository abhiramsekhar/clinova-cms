# Known Issues

- Reception Browser Verification: modal visibility, registration, appointment booking, payment, cancellation, no-show timing, and search still require real Reception-user browser/Network verification; no browser console or Network tool was available during this repair.
- Reception Registration: exact reported live failure is unverified because no browser Network response was available; the existing backend contract matches the React payload. Registration fee display remains hard-coded to ₹200 while the backend fee is configurable and no Reception-readable fee endpoint exists.
- Reception Directories: patient, appointment, and bill screens request up to 200 results per API page; larger datasets need server-side table pagination or page aggregation.
- Global Search: Reception and Doctor patient suggestions are API-backed; the full legacy Admin/Doctor grouped search (staff, users, appointments, prescriptions, labs, and catalog) is not implemented in this targeted fix.
- Doctor Consultation (D4): This data repair displays existing authorized records, but the legacy clinical editor workflow (save draft, complete/lock, addendum, prescription builder and lab-order creation) is still not implemented in React.
- Doctor Prescriptions/Lab Orders (D5-D6): Lists, status filters and returned details/results are implemented; create, cancel, prescription print/detail actions remain outstanding for full legacy parity.
- Doctor Live Verification: No browser Network/console session was available. Verify Doctor accounts with populated and empty data, search/status/date filters, patient profiles, lab results, errors/retries and role isolation against the running server.
- Admin Staff (A2): The legacy schedule editor is not implemented because the staff API contract has no schedule-management operation. Admin dashboard and staff workflows still require live browser/Network verification.
- Admin Users (A3): The Users serializer does not support account creation; create staff accounts through A2 Staff Management. Live Admin browser verification is pending.
- Admin Departments (A4): `headDoctorId` is read-only in the backend serializer, so the UI cannot assign a department head. Live Admin browser verification is pending.
- Admin Lab Catalog (A5): Legacy Admin scope supports price edits only. Generic backend create/delete methods exist, but the page intentionally exposes neither; live browser verification is pending.
- Admin Suppliers (A6): The supplier rates endpoint returns typical medicine references without unit prices; the page cannot show negotiated rate amounts. Live Admin browser verification is pending.
- Admin Reports (A7): Outstanding-balance and lab reports are unsupported and unavailable. Medicine results are a current stock snapshot with no date filtering; the endpoint caps reports at 100 rows. Live browser verification is pending.
- Admin Settings (A8): Only keys currently represented by the backend seed/configuration are editable. Data export/import and reset endpoints do not exist and are not shown. Live Admin browser verification is pending.
- Admin Audit Log (A9): Search covers action, actor username and entity identifiers; it does not search JSON detail values. The page hides metadata values to avoid displaying sensitive details. Live Admin browser verification is pending.
