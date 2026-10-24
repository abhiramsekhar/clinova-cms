# Backend Changes

## Authentication
- `cms_backendapp/views_auth.py`: On password mismatch, calculate remaining attempts (`5 - failed_attempts`) and include `attempts_remaining` and descriptive detail message (`Invalid username or password. N attempts remaining.` and `Account locked for 5 minutes due to too many failed attempts.` on reaching 5 attempts) to achieve full parity with legacy `auth.js`.
