"""
cms_backend/models.py
Shared / general data used across all five role apps: the ID-sequence
counter, Department & Role master data, and Staff/User (identity + login).
"""

from django.db import models, transaction
from django.core.validators import MinValueValidator
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone


# ---------------------------------------------------------------------
# ID generation helper — mirrors the id_sequences table / trigger logic.
# Imported by every other app: `from cms_backendapp.models import generate_prefixed_id`
# ---------------------------------------------------------------------

class IdSequence(models.Model):
    """Central counter used to mint prefixed, sequential IDs."""
    entity_type = models.CharField(max_length=20, primary_key=True)
    last_value = models.IntegerField(default=0)

    class Meta:
        db_table = "id_sequences"

    def __str__(self):
        return f"{self.entity_type} -> {self.last_value}"


def generate_prefixed_id(entity_type: str, prefix: str, width: int = 4, with_year: bool = False) -> str:
    """
    Atomically increments the counter row for `entity_type` and returns
    a formatted ID like 'DOC-0007' or, with with_year=True, 'PAT-2026-0007'.
    Must be called from inside a transaction that also performs the
    insert, so the ID and the row are committed (or rolled back) together.
    """
    seq, _ = IdSequence.objects.select_for_update().get_or_create(
        entity_type=entity_type, defaults={"last_value": 0}
    )
    seq.last_value += 1
    seq.save(update_fields=["last_value"])
    number = str(seq.last_value).zfill(width)
    if with_year:
        return f"{prefix}-{timezone.now().year}-{number}"
    return f"{prefix}-{number}"


# ---------------------------------------------------------------------
# Master data
# ---------------------------------------------------------------------

class Department(models.Model):
    department_id = models.CharField(max_length=15, primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    description = models.CharField(max_length=255, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "departments"

    def __str__(self):
        return self.name

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.department_id:
            self.department_id = generate_prefixed_id("DEPARTMENT", "DEPT")
        super().save(*args, **kwargs)


class Role(models.Model):
    """Fixed, small set of roles — seeded as data (see migrations), not hardcoded."""
    role_id = models.CharField(max_length=20, primary_key=True)
    role_name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "roles"

    def __str__(self):
        return self.role_name


class LabTestCatalog(models.Model):
    """
    Admin-managed master data: which lab tests exist and their price.
    Placed here (not in labtech_app) because it's reference data read by
    doctor_app (ordering) and receptionist_app (billing) too — same
    pattern as Department. Move to admin_app if you'd rather Admin own
    it explicitly; it's a two-line change (just this class + its FK
    target strings elsewhere).
    """
    test_catalog_id = models.CharField(max_length=15, primary_key=True)
    test_name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="lab_test_types",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                                 validators=[MinValueValidator(0)])
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lab_test_catalog"

    def __str__(self):
        return self.test_name

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.test_catalog_id:
            self.test_catalog_id = generate_prefixed_id("LAB_CATALOG", "LABCAT")
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------
# Staff / auth
# ---------------------------------------------------------------------

class Staff(models.Model):
    """Professional/personal record for every employee (all 5 roles)."""
    staff_id = models.CharField(max_length=15, primary_key=True)
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True, null=True)
    email = models.EmailField(max_length=100, unique=True, blank=True, null=True)
    date_joined = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)  # employment status (soft delete)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "staff"

    def __str__(self):
        return self.name

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.staff_id:
            self.staff_id = generate_prefixed_id("STAFF", "STF")
        super().save(*args, **kwargs)


class User(models.Model):
    """
    Login credentials, 1:1 with Staff. Plain model (not django.contrib.auth's
    User / AbstractBaseUser) — mirrors the `users` table exactly. Has
    set_password()/check_password() built on Django's own hashers, so
    passwords are still hashed securely; it just isn't wired into Django's
    built-in auth/permission system or request.user. Say the word if you
    want that conversion done instead.
    """
    user_id = models.CharField(max_length=15, primary_key=True)
    staff = models.OneToOneField(Staff, on_delete=models.PROTECT, related_name="user_account")
    username = models.CharField(max_length=50, unique=True)
    password_hash = models.CharField(max_length=255)
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="users")
    is_active = models.BooleanField(default=True)  # login/account status
    last_login = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"
        indexes = [models.Index(fields=["role"])]

    def __str__(self):
        return self.username

    def set_password(self, raw_password: str) -> None:
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password(raw_password, self.password_hash)

    @transaction.atomic
    def save(self, *args, **kwargs):
        if not self.user_id:
            self.user_id = generate_prefixed_id("USER", "USR")
        super().save(*args, **kwargs)