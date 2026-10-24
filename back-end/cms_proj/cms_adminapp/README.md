# Admin API

This app owns the administrator API implementation. It uses the existing
shared and domain models, so it does not create duplicate database tables.

## URL hookup

The project URL configuration mounts this URLconf at `/api/admin/`:

```python
path("api/admin/", include("cms_adminapp.urls")),
```

## Endpoints

- `GET /api/admin/dashboard/`
- `GET /api/admin/roles/` (also safely synchronizes any missing supported role rows)
- CRUD `/api/admin/staff/`, `/api/admin/users/`, `/api/admin/departments/`,
  `/api/admin/lab-catalog/`, and `/api/admin/suppliers/`
- `POST /api/admin/users/{id}/reset-password/` (requires `password` and `confirmPassword`) and `/api/admin/users/{id}/unlock/`
- `POST /api/admin/staff/{id}/deactivate/`
- `GET /api/admin/reports/?type=overview|financial|appointments|patients|staff|audit`
- `GET /api/admin/settings/`, `POST /api/admin/settings/`, and `PATCH /api/admin/settings/`
- `GET /api/admin/audit-log/`

All endpoints require an authenticated account with the `ADMIN` role.

## First admin login

The login screen authenticates against the shared users table. If the demo
account is absent, create only the administrator account from this project
directory with:

```powershell
$env:DEBUG = 'False'
..\venv\Scripts\python.exe manage.py bootstrap_admin --username admin
```

Enter `Admin@123` twice at the prompts if you want to use the frontend's demo
admin credentials. To replace the password for an existing admin account,
rerun with `--reset-password`. The command does not seed other demo data and
does not modify an existing non-admin account.
