"""
cms_backendapp/tests.py
Automated tests for Auth endpoints and role permissions.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APITestCase, APIRequestFactory
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Role, Staff, User
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
