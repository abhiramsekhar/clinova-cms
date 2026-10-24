"""
cms_backendapp/tests.py
Automated tests for Auth endpoints and role permissions.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APITestCase, APIRequestFactory
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Department, Role, Setting, Staff, User
from cms_backendapp.permissions import IsRole


class AdminProtectedView(APIView):
    """Test view protected for ADMIN only."""
    permission_classes = [IsRole("ADMIN")]

    def get(self, request):
        return Response({"granted": True})


class AuthTests(APITestCase):
    def setUp(self):
        # Master roles
        self.role_admin = Role.objects.create(role_id="ADMIN", role_name="Administrator")
        self.role_doctor = Role.objects.create(role_id="DOCTOR", role_name="Doctor")

        # Staff records
        self.staff_admin = Staff.objects.create(
            staff_id="STF-0001",
            name="System Admin",
            email="admin@clinova.test",
            is_active=True,
        )
        self.staff_doctor = Staff.objects.create(
            staff_id="STF-0002",
            name="Dr. Sarah Johnson",
            email="sarah@clinova.test",
            is_active=True,
        )
        self.staff_inactive = Staff.objects.create(
            staff_id="STF-0003",
            name="Inactive Staff",
            email="inactive@clinova.test",
            is_active=False,
        )

        # Users
        self.user_admin = User.objects.create(
            user_id="USR-0001",
            username="admin",
            role=self.role_admin,
            staff=self.staff_admin,
            is_active=True,
        )
        self.user_admin.set_password("Admin@123")
        self.user_admin.save()

        self.user_doctor = User.objects.create(
            user_id="USR-0002",
            username="dr.sarah",
            role=self.role_doctor,
            staff=self.staff_doctor,
            is_active=True,
        )
        self.user_doctor.set_password("Doctor@123")
        self.user_doctor.save()

        self.user_inactive = User.objects.create(
            user_id="USR-0003",
            username="inactive.user",
            role=self.role_admin,
            staff=self.staff_inactive,
            is_active=False,
        )
        self.user_inactive.set_password("Pass@123")
        self.user_inactive.save()

    def test_login_success(self):
        url = "/api/auth/login/"
        payload = {"username": "admin", "password": "Admin@123"}
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertIn("user", response.data)

        user_data = response.data["user"]
        self.assertEqual(user_data["username"], "admin")
        self.assertEqual(user_data["role"], "ADMIN")
        self.assertEqual(user_data["staffId"], "STF-0001")
        self.assertEqual(user_data["staffName"], "System Admin")

    def test_login_fail_wrong_password(self):
        url = "/api/auth/login/"
        payload = {"username": "admin", "password": "WrongPassword"}
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data.get("code"), "invalid_credentials")

    def test_login_fail_nonexistent_user(self):
        url = "/api/auth/login/"
        payload = {"username": "ghost", "password": "Password@123"}
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_fail_inactive_user(self):
        url = "/api/auth/login/"
        payload = {"username": "inactive.user", "password": "Pass@123"}
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get("code"), "account_inactive")

    def test_me_endpoint_authenticated(self):
        refresh = RefreshToken.for_user(self.user_admin)
        token = str(refresh.access_token)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "admin")
        self.assertEqual(response.data["role"], "ADMIN")
        self.assertEqual(response.data["staffId"], "STF-0001")

    def test_me_endpoint_unauthenticated(self):
        self.client.credentials()  # clear headers
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh(self):
        refresh = RefreshToken.for_user(self.user_admin)
        payload = {"refresh": str(refresh)}

        response = self.client.post("/api/auth/refresh/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_logout_endpoint(self):
        refresh = RefreshToken.for_user(self.user_admin)
        payload = {"refresh": str(refresh)}

        response = self.client.post("/api/auth/logout/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_role_permission_enforcement(self):
        from rest_framework.test import force_authenticate

        factory = APIRequestFactory()
        view = AdminProtectedView.as_view()

        # Unauthenticated should be rejected with 401
        req_anon = factory.get("/dummy/")
        resp_anon = view(req_anon)
        self.assertEqual(resp_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # Authenticated as Doctor should be rejected with 403
        req_doc = factory.get("/dummy/")
        force_authenticate(req_doc, user=self.user_doctor)
        resp_doc = view(req_doc)
        self.assertEqual(resp_doc.status_code, status.HTTP_403_FORBIDDEN)

        # Authenticated as Admin should pass with 200
        req_admin = factory.get("/dummy/")
        force_authenticate(req_admin, user=self.user_admin)
        resp_admin = view(req_admin)
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_admin.data["granted"], True)


class AdminDomainTests(APITestCase):
    def setUp(self):
        from decimal import Decimal
        from cms_backendapp.models import Department, Setting, Notification, AuditLog

        self.role_admin = Role.objects.create(role_id="ADMIN", role_name="Administrator")
        self.role_doc = Role.objects.create(role_id="DOCTOR", role_name="Doctor")
        self.role_receptionist = Role.objects.create(role_id="RECEPTIONIST", role_name="Receptionist")
        Role.objects.create(role_id="PHARMACIST", role_name="Pharmacist")
        Role.objects.create(role_id="LAB_TECH", role_name="Lab Technician")

        self.staff_admin = Staff.objects.create(
            staff_id="STF-ADM-01",
            name="System Administrator",
            email="admin@clinova.test",
            role=self.role_admin,
            is_active=True,
        )
        self.user_admin = User.objects.create(
            user_id="USR-ADM-01",
            username="superadmin",
            role=self.role_admin,
            staff=self.staff_admin,
            is_active=True,
        )
        self.user_admin.set_password("Admin@123")
        self.user_admin.save()

        self.staff_doc = Staff.objects.create(
            staff_id="STF-DOC-01",
            name="Dr. Test",
            email="doc@clinova.test",
            role=self.role_doc,
            is_active=True,
        )
        self.user_doc = User.objects.create(
            user_id="USR-DOC-01",
            username="docuser",
            role=self.role_doc,
            staff=self.staff_doc,
            is_active=True,
        )
        self.user_doc.set_password("Doc@123")
        self.user_doc.save()

        self.dept = Department.objects.create(
            department_id="DEPT-01",
            name="Cardiology",
            code="CARDIO",
            default_fee=Decimal("600.00"),
            is_active=True,
        )

        Setting.objects.create(setting_id="s1", key="hospital.name", value='"Clinova Care"')
        Notification.objects.create(
            notification_id="n1",
            notification_type="SYSTEM",
            title="System Alert",
            message="Server upgraded",
            target_role="ADMIN",
            is_read=False,
        )

    def auth_headers(self, user):
        token = RefreshToken.for_user(user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_user_list_reset_password_unlock(self):
        headers = self.auth_headers(self.user_admin)

        # List users
        res = self.client.get("/api/users/", **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Reset password
        res_reset = self.client.post(f"/api/users/{self.user_doc.user_id}/reset-password/", {"password": "NewDocPassword@123"}, format="json", **headers)
        self.assertEqual(res_reset.status_code, status.HTTP_200_OK)
        self.user_doc.refresh_from_db()
        self.assertTrue(self.user_doc.check_password("NewDocPassword@123"))

        # Unlock user
        res_unlock = self.client.post(f"/api/users/{self.user_doc.user_id}/unlock/", format="json", **headers)
        self.assertEqual(res_unlock.status_code, status.HTTP_200_OK)

    def test_staff_list_and_doctors_dropdown(self):
        headers = self.auth_headers(self.user_admin)
        res_staff = self.client.get("/api/staff/", **headers)
        self.assertEqual(res_staff.status_code, status.HTTP_200_OK)
        self.assertIn("results", res_staff.data)

        res_docs = self.client.get("/api/staff/doctors/", **headers)
        self.assertEqual(res_docs.status_code, status.HTTP_200_OK)
        self.assertTrue(any(s["id"] == "STF-DOC-01" for s in res_docs.data))

    def _user_for_role(self, role_id):
        role, _ = Role.objects.get_or_create(
            role_id=role_id,
            defaults={"role_name": role_id.replace("_", " ").title()},
        )
        staff = Staff.objects.create(
            name=f"{role_id} user",
            email=f"{role_id.lower()}@clinova.test",
            role=role,
        )
        user = User.objects.create(staff=staff, username=f"user-{role_id.lower()}", role=role)
        user.set_password("Existing@Pass123")
        user.save()
        return user

    def test_admin_dashboard_is_admin_only(self):
        response = self.client.get("/api/dashboard/admin/", **self.auth_headers(self.user_admin))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {
            "staffCount", "activeDoctors", "todayAppointments", "pendingLabs",
            "lowStockMedicines", "totalRevenuePaise",
        })

        for role_id in ["DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECH"]:
            user = self.user_doc if role_id == "DOCTOR" else self._user_for_role(role_id)
            denied = self.client.get("/api/dashboard/admin/", **self.auth_headers(user))
            self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN, role_id)

    def test_staff_list_permissions_and_filters(self):
        admin_headers = self.auth_headers(self.user_admin)
        response = self.client.get("/api/staff/?role=DOCTOR&is_active=true&search=Test", **admin_headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], "STF-DOC-01")

        receptionist = self._user_for_role("RECEPTIONIST")
        allowed = self.client.get("/api/staff/", **self.auth_headers(receptionist))
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

        denied = self.client.get("/api/staff/", **self.auth_headers(self.user_doc))
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_creation_creates_linked_hashed_account(self):
        headers = self.auth_headers(self.user_admin)
        payload = {
            "name": "New Receptionist",
            "email": "new.receptionist@clinova.test",
            "roleId": "RECEPTIONIST",
            "departmentId": self.dept.department_id,
            "username": "new.receptionist",
            "password": "A-Unique-Staff-Password-2468!",
        }
        response = self.client.post("/api/staff/", payload, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        staff = Staff.objects.get(pk=response.data["id"])
        account = User.objects.get(staff=staff)
        self.assertEqual(account.role_id, "RECEPTIONIST")
        self.assertTrue(account.check_password(payload["password"]))
        self.assertNotEqual(account.password_hash, payload["password"])
        self.assertNotIn("password", response.data)
        self.assertNotIn("username", response.data)

    def test_doctor_staff_creation_creates_doctor_profile(self):
        from cms_doctorapp.models import Doctor

        payload = {
            "name": "New Doctor",
            "email": "new.doctor@clinova.test",
            "roleId": "DOCTOR",
            "departmentId": self.dept.department_id,
            "username": "new.doctor",
            "password": "A-Unique-Doctor-Password-2468!",
        }
        response = self.client.post("/api/staff/", payload, format="json", **self.auth_headers(self.user_admin))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        profile = Doctor.objects.get(staff_id=response.data["id"])
        self.assertEqual(profile.department_id, self.dept.department_id)

    def test_staff_create_rejects_invalid_or_duplicate_account_data(self):
        headers = self.auth_headers(self.user_admin)
        base = {
            "name": "Staff Candidate", "email": "candidate@clinova.test",
            "roleId": "RECEPTIONIST", "username": "candidate",
            "password": "A-Unique-Candidate-Password-2468!",
        }
        invalid_role = self.client.post("/api/staff/", {**base, "roleId": "UNKNOWN"}, format="json", **headers)
        self.assertEqual(invalid_role.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Staff.objects.filter(email=base["email"]).exists())

        missing_password = self.client.post("/api/staff/", {**base, "password": ""}, format="json", **headers)
        self.assertEqual(missing_password.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Staff.objects.filter(email=base["email"]).exists())

        duplicate_username = self.client.post(
            "/api/staff/",
            {**base, "email": "another.candidate@clinova.test", "username": "docuser"},
            format="json", **headers,
        )
        self.assertEqual(duplicate_username.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Staff.objects.filter(email="another.candidate@clinova.test").exists())

    def test_staff_account_creation_rolls_back_staff_if_account_save_fails(self):
        from unittest.mock import patch
        from django.db import IntegrityError

        payload = {
            "name": "Rollback Candidate", "email": "rollback@clinova.test",
            "roleId": "RECEPTIONIST", "username": "rollback.candidate",
            "password": "A-Unique-Rollback-Password-2468!",
        }
        staff_count = Staff.objects.count()
        with patch.object(User, "save", side_effect=IntegrityError("simulated account insert failure")):
            with self.assertRaises(IntegrityError):
                self.client.post("/api/staff/", payload, format="json", **self.auth_headers(self.user_admin))
        self.assertEqual(Staff.objects.count(), staff_count)
        self.assertFalse(Staff.objects.filter(email=payload["email"]).exists())

    def test_staff_update_syncs_linked_user_role_and_doctor_department(self):
        from cms_doctorapp.models import Doctor

        create_payload = {
            "name": "Editable Staff", "email": "editable@clinova.test",
            "roleId": "DOCTOR", "departmentId": self.dept.department_id,
            "username": "editable.staff", "password": "A-Unique-Editable-Password-2468!",
        }
        created = self.client.post("/api/staff/", create_payload, format="json", **self.auth_headers(self.user_admin))
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        staff_id = created.data["id"]
        other_dept = Department.objects.create(
            name="Neurology", code="NEURO", default_fee="500.00"
        )
        updated = self.client.patch(
            f"/api/staff/{staff_id}/",
            {"roleId": "LAB_TECH", "departmentId": other_dept.department_id},
            format="json", **self.auth_headers(self.user_admin),
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        linked_user = User.objects.get(staff_id=staff_id)
        self.assertEqual(linked_user.role_id, "LAB_TECH")
        self.assertEqual(Doctor.objects.get(staff_id=staff_id).department_id, other_dept.department_id)

    def test_staff_deactivation_and_future_appointment_restriction(self):
        from datetime import timedelta
        from django.utils import timezone
        from cms_doctorapp.models import Doctor
        from cms_recepapp.models import Appointment, Patient

        headers = self.auth_headers(self.user_admin)
        self.user_doc.is_active = True
        self.staff_doc.is_active = True
        self.user_doc.save(update_fields=["is_active"])
        self.staff_doc.save(update_fields=["is_active"])
        Doctor.objects.get_or_create(staff=self.staff_doc, defaults={"department": self.dept})
        patient = Patient.objects.create(name="Test Patient", is_active=True)
        Appointment.objects.create(
            patient=patient,
            doctor=Doctor.objects.get(staff=self.staff_doc),
            department=self.dept,
            appointment_date=timezone.localdate() + timedelta(days=1),
            time_slot="10:00 AM",
            status="SCHEDULED",
        )
        blocked = self.client.post(f"/api/staff/{self.staff_doc.staff_id}/deactivate/", format="json", **headers)
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.staff_doc.refresh_from_db()
        self.user_doc.refresh_from_db()
        self.assertTrue(self.staff_doc.is_active)
        self.assertTrue(self.user_doc.is_active)

        Appointment.objects.all().delete()
        allowed = self.client.post(f"/api/staff/{self.staff_doc.staff_id}/deactivate/", format="json", **headers)
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.staff_doc.refresh_from_db()
        self.user_doc.refresh_from_db()
        self.assertFalse(self.staff_doc.is_active)
        self.assertFalse(self.user_doc.is_active)

    def test_staff_mutations_reject_non_admin_and_unsupported_methods(self):
        headers = self.auth_headers(self.user_doc)
        payload = {
            "name": "Forbidden", "email": "forbidden@clinova.test", "roleId": "DOCTOR",
            "username": "forbidden", "password": "A-Unique-Forbidden-Password-2468!",
        }
        denied_create = self.client.post("/api/staff/", payload, format="json", **headers)
        self.assertEqual(denied_create.status_code, status.HTTP_403_FORBIDDEN)
        denied_update = self.client.patch(
            f"/api/staff/{self.staff_doc.staff_id}/", {"name": "Changed"}, format="json", **headers
        )
        self.assertEqual(denied_update.status_code, status.HTTP_403_FORBIDDEN)
        denied_deactivate = self.client.post(
            f"/api/staff/{self.staff_doc.staff_id}/deactivate/", format="json", **headers
        )
        self.assertEqual(denied_deactivate.status_code, status.HTTP_403_FORBIDDEN)
        unsupported = self.client.delete(f"/api/staff/{self.staff_doc.staff_id}/", **self.auth_headers(self.user_admin))
        self.assertEqual(unsupported.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_department_crud_with_default_fee_in_paise(self):
        headers = self.auth_headers(self.user_admin)

        # Check defaultFee in paise
        res = self.client.get("/api/departments/", **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["results"][0]["defaultFee"], 60000)

        # Create new department with fee in paise (75000 paise = ₹750)
        payload = {
            "name": "Neurology",
            "code": "NEURO",
            "defaultFee": 75000,
        }
        res_post = self.client.post("/api/departments/", payload, format="json", **headers)
        self.assertEqual(res_post.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_post.data["defaultFee"], 75000)

    def test_settings_dict_and_patch(self):
        import json
        headers = self.auth_headers(self.user_admin)

        # GET settings
        res = self.client.get("/api/settings/", **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("hospital.name"), '"Clinova Care"')

        # PATCH settings
        res_patch = self.client.patch(
            "/api/settings/",
            {"hospital.name": "Clinova Hospital", "appointment.startTime": "10:30", "appointment.slotDuration": 45},
            format="json", **headers,
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(Setting.objects.get(key="appointment.startTime").value, json.dumps("10:30"))
        self.assertEqual(json.loads(Setting.objects.get(key="appointment.startTime").value), "10:30")
        self.assertEqual(json.loads(Setting.objects.get(key="appointment.slotDuration").value), 45)
        self.assertEqual(json.loads(Setting.objects.get(key="hospital.name").value), "Clinova Hospital")

    def test_dashboard_kpis_and_reports(self):
        headers = self.auth_headers(self.user_admin)

        res_dash = self.client.get("/api/dashboard/admin/", **headers)
        self.assertEqual(res_dash.status_code, status.HTTP_200_OK)
        self.assertIn("staffCount", res_dash.data)

        res_rep = self.client.get("/api/reports/generate/?type=appointments", **headers)
        self.assertEqual(res_rep.status_code, status.HTTP_200_OK)
        self.assertIn("data", res_rep.data)

    def test_reports_reject_unsupported_types_and_invalid_date_ranges(self):
        headers = self.auth_headers(self.user_admin)
        unsupported = self.client.get("/api/reports/generate/?type=lab", **headers)
        self.assertEqual(unsupported.status_code, status.HTTP_400_BAD_REQUEST)
        invalid_date = self.client.get("/api/reports/generate/?type=revenue&start=2026-02-31", **headers)
        self.assertEqual(invalid_date.status_code, status.HTTP_400_BAD_REQUEST)
        reversed_range = self.client.get(
            "/api/reports/generate/?type=appointments&start=2026-02-02&end=2026-02-01", **headers
        )
        self.assertEqual(reversed_range.status_code, status.HTTP_400_BAD_REQUEST)

    def test_audit_log_serializer_mapping_search_filters_and_permissions(self):
        from cms_backendapp.models import AuditLog

        headers = self.auth_headers(self.user_admin)
        AuditLog.objects.create(
            log_id="LOG-ADMIN-01", user=self.user_admin, action="SAVE_SETTINGS",
            entity_type="SETTINGS", entity_id="clinic.name", details={"updated": True},
        )
        AuditLog.objects.create(
            log_id="LOG-ADMIN-02", user=self.user_doc, action="UNLOCK",
            entity_type="USER", entity_id=self.user_doc.user_id, details={},
        )
        response = self.client.get(
            "/api/audit-log/?search=superadmin&action=SAVE_SETTINGS&resource_type=SETTINGS",
            **headers,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        entry = response.data["results"][0]
        self.assertEqual(entry["resourceType"], "SETTINGS")
        self.assertEqual(entry["resourceId"], "clinic.name")
        self.assertEqual(entry["userName"], "superadmin")

        too_long = self.client.get(f"/api/audit-log/?search={'x' * 101}", **headers)
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)
        forbidden = self.client.get("/api/audit-log/", **self.auth_headers(self.user_doc))
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_password_reset_rejects_password_that_fails_policy(self):
        headers = self.auth_headers(self.user_admin)
        response = self.client.post(
            f"/api/users/{self.user_doc.user_id}/reset-password/",
            {"password": "short"}, format="json", **headers,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user_doc.refresh_from_db()
        self.assertTrue(self.user_doc.check_password("Doc@123"))

    def test_notifications_lifecycle(self):
        headers = self.auth_headers(self.user_admin)

        res = self.client.get("/api/notifications/", **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

        res_read = self.client.patch(f"/api/notifications/n1/read/", format="json", **headers)
        self.assertEqual(res_read.status_code, status.HTTP_200_OK)
        self.assertTrue(res_read.data["isRead"])

    def test_admin_permissions(self):
        headers_doc = self.auth_headers(self.user_doc)

        # Doctor accessing /api/users/ -> 403
        res = self.client.get("/api/users/", **headers_doc)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Anonymous -> 401
        res_anon = self.client.get("/api/users/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_id_sequence_generation(self):
        from cms_backendapp.models import generate_prefixed_id, IdSequence
        from django.db import transaction

        with transaction.atomic():
            id1 = generate_prefixed_id("CUSTOM_TEST", "CUST", width=4)
            id2 = generate_prefixed_id("CUSTOM_TEST", "CUST", width=4)

        self.assertEqual(id1, "CUST-0001")
        self.assertEqual(id2, "CUST-0002")
        seq = IdSequence.objects.get(entity_type="CUSTOM_TEST")
        self.assertEqual(seq.last_value, 2)

    def test_audit_log_sensitive_action(self):
        headers = self.auth_headers(self.user_admin)
        from cms_backendapp.models import AuditLog

        # Reset password triggers AuditLog
        res = self.client.post(
            f"/api/users/{self.user_doc.user_id}/reset-password/",
            {"password": "ChangedPass@123"},
            format="json",
            **headers,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        log = AuditLog.objects.filter(action="RESET_PASSWORD", entity_id=self.user_doc.user_id).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.entity_type, "USER")

