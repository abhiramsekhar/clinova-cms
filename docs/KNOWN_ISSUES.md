# Known Issues

- Reception Browser Verification: modal visibility, registration, appointment booking, payment, cancellation, no-show timing, and search still require real Reception-user browser/Network verification; no browser console or Network tool was available during this repair.
- Reception Registration: exact reported live failure is unverified because no browser Network response was available; the existing backend contract matches the React payload. Registration fee display remains hard-coded to ₹200 while the backend fee is configurable and no Reception-readable fee endpoint exists.
- Reception Directories: patient, appointment, and bill screens request up to 200 results per API page; larger datasets need server-side table pagination or page aggregation.
- Global Search: Reception and Doctor patient suggestions are API-backed; the full legacy Admin/Doctor grouped search (staff, users, appointments, prescriptions, labs, and catalog) is not implemented in this targeted fix.
- Doctor Consultation (D4): This data repair displays existing authorized records, but the legacy clinical editor workflow (save draft, complete/lock, addendum, prescription builder and lab-order creation) is still not implemented in React.
- Doctor Prescriptions/Lab Orders (D5-D6): Lists, status filters and returned details/results are implemented; create, cancel, prescription print/detail actions remain outstanding for full legacy parity.
- Doctor Live Verification: No browser Network/console session was available. Verify Doctor accounts with populated and empty data, search/status/date filters, patient profiles, lab results, errors/retries and role isolation against the running server.
