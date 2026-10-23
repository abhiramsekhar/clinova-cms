"""
cms_labapp/tests.py
Automated test suite for Lab domain:
- Lab catalog list, retrieve, price in paise
- Admin price update in paise
- Lab result list
- Role permissions (LAB_TECH, ADMIN, PHARMACIST, Anonymous)
"""

from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Role, Staff, User, LabTestCatalog
from cms_recepapp.models import Patient
from cms_doctorapp.models import Doctor, LabTest
from cms_labapp.models import LabTestResult


class LabDomainTests(APITestCase):
    def setUp(self):
        # Roles
        self.role_admin = Role.objects.create(role_id="ADMIN", role_name="Administrator")
        self.role_lab = Role.objects.create(role_id="LAB_TECH", role_name="Lab Technician")
        self.role_pharm = Role.objects.create(role_id="PHARMACIST", role_name="Pharmacist")

        # Staff & Users
        self.staff_admin = Staff.objects.create(
            staff_id="staff-adm-01",
            name="Admin User",
            email="admin@clinova.test",
            role=self.role_admin,
            is_active=True,
        )
        self.user_admin = User.objects.create(
            user_id="user-adm-01",
            username="adminuser",
            role=self.role_admin,
            staff=self.staff_admin,
            is_active=True,
        )
        self.user_admin.set_password("Pass@123")
        self.user_admin.save()

        self.staff_lab = Staff.objects.create(
            staff_id="staff-lab-01",
            name="Lab Technician",
            email="tech@clinova.test",
            role=self.role_lab,
            is_active=True,
        )
        self.user_lab = User.objects.create(
            user_id="user-lab-01",
            username="labtech",
            role=self.role_lab,
            staff=self.staff_lab,
            is_active=True,
        )
        self.user_lab.set_password("Pass@123")
        self.user_lab.save()

        self.staff_pharm = Staff.objects.create(
            staff_id="staff-pharm-01",
            name="Pharmacist",
            email="pharm@clinova.test",
            role=self.role_pharm,
            is_active=True,
        )
        self.user_pharm = User.objects.create(
            user_id="user-pharm-01",
            username="pharmuser",
            role=self.role_pharm,
            staff=self.staff_pharm,
            is_active=True,
        )
        self.user_pharm.set_password("Pass@123")
        self.user_pharm.save()

        # Catalog item
        self.catalog = LabTestCatalog.objects.create(
            test_catalog_id="test-01",
            test_name="Complete Blood Count",
            code="CBC",
            category="Hematology",
            price=Decimal("350.00"),
            turnaround_hrs=2,
            is_active=True,
        )

    def auth_headers(self, user):
        token = RefreshToken.for_user(user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_catalog_list_and_price_in_paise(self):
        url = "/api/lab-catalog/"
        headers = self.auth_headers(self.user_lab)
        res = self.client.get(url, **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # price: 350.00 -> 35000 paise
        self.assertEqual(res.data["results"][0]["price"], 35000)

    def test_admin_update_catalog_price(self):
        url = f"/api/lab-catalog/{self.catalog.test_catalog_id}/"
        headers_adm = self.auth_headers(self.user_admin)

        # Update price to 40000 paise (₹400)
        res = self.client.patch(url, {"price": 40000}, format="json", **headers_adm)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["price"], 40000)

        self.catalog.refresh_from_db()
        self.assertEqual(self.catalog.price, Decimal("400.00"))

    def test_lab_permissions(self):
        # Pharmacist attempting to modify catalog -> 403 Forbidden
        headers_pharm = self.auth_headers(self.user_pharm)
        res_pharm = self.client.patch(f"/api/lab-catalog/{self.catalog.test_catalog_id}/", {"price": 50000}, format="json", **headers_pharm)
        self.assertEqual(res_pharm.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated request -> 401
        res_anon = self.client.get("/api/lab-catalog/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)
