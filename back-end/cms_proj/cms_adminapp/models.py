from django.db import models

# Create your models here.
"""
admin_app/models.py
Admin's own module: FR-ADM-01 to FR-ADM-06.
No new models — Admin's job (staff/user/role/department CRUD, reports,
backups) operates entirely on models already defined in cms_backend
(Staff, User, Role, Department, LabTestCatalog). This file is a
placeholder so the app has a models.py; put Admin's views/serializers
in this app and import from cms_backend.models as needed, e.g.:

    from cms_backend.models import Staff, User, Role, Department, LabTestCatalog
"""