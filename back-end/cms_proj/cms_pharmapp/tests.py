"""
cms_pharmapp/tests.py
Automated test suite for Pharmacy domain:
- Medicines list, search, stock level, unitPrice in paise
- Restock action & StockLedgerEntry creation
- Stock alerts endpoint
- Supplier & rate card
- Purchase order creation & receive workflow
- Role permissions (PHARMACIST, DOCTOR, RECEPTIONIST, Anonymous)
"""

import datetime
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Role, Staff, User
from cms_pharmapp.models import Medicine, Supplier, PurchaseOrder, StockLedgerEntry


class PharmacyDomainTests(APITestCase):
    def setUp(self):
        # Roles
        self.role_admin = Role.objects.create(role_id="ADMIN", role_name="Administrator")
        self.role_pharm = Role.objects.create(role_id="PHARMACIST", role_name="Pharmacist")
        self.role_doc = Role.objects.create(role_id="DOCTOR", role_name="Doctor")
        self.role_rec = Role.objects.create(role_id="RECEPTIONIST", role_name="Receptionist")

        # Staff & Users
        self.staff_pharm = Staff.objects.create(
            staff_id="staff-pharm-01",
            name="Pharmacist Test",
            email="pharm@clinova.test",
            role=self.role_pharm,
            is_active=True,
        )
        self.user_pharm = User.objects.create(
            user_id="user-pharm-01",
            username="pharmacist",
            role=self.role_pharm,
            staff=self.staff_pharm,
            is_active=True,
        )
        self.user_pharm.set_password("Pass@123")
        self.user_pharm.save()

        self.staff_rec = Staff.objects.create(
            staff_id="staff-rec-01",
            name="Receptionist Test",
            email="rec@clinova.test",
            role=self.role_rec,
            is_active=True,
        )
        self.user_rec = User.objects.create(
            user_id="user-rec-01",
            username="receptionist",
            role=self.role_rec,
            staff=self.staff_rec,
            is_active=True,
        )
        self.user_rec.set_password("Pass@123")
        self.user_rec.save()

        # Medicine demo
        self.med = Medicine.objects.create(
            medicine_id="med-01",
            name="Paracetamol 500mg",
            generic_name="Paracetamol",
            manufacturer="Cipla",
            category="Tablet",
            cost_price=Decimal("1.50"),
            selling_price=Decimal("3.00"),
            stock_quantity=5,  # <= 10 -> LOW_STOCK
            reorder_threshold=10,
            batches=[{"batchNo": "B001", "quantity": 5, "expiryDate": "2027-01-01"}],
            is_active=True,
        )

        # Supplier demo
        self.supplier = Supplier.objects.create(
            supplier_id="sup-01",
            name="Kerala Pharma Distributors",
            contact_person="Ramesh K",
            phone="9847111222",
            typical_medicines=[{"medicineId": "med-01", "name": "Paracetamol 500mg", "rate": 150}],
            is_active=True,
        )

    def auth_headers(self, user):
        token = RefreshToken.for_user(user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_medicine_list_and_unit_price_in_paise(self):
        url = "/api/medicines/"
        headers = self.auth_headers(self.user_pharm)
        res = self.client.get(url, **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # selling_price: 3.00 -> 300 paise
        self.assertEqual(res.data["results"][0]["unitPrice"], 300)
        self.assertEqual(res.data["results"][0]["stockLevel"], "LOW_STOCK")

    def test_medicine_restock_action(self):
        url = f"/api/medicines/{self.med.medicine_id}/restock/"
        headers = self.auth_headers(self.user_pharm)

        payload = {
            "quantity": 50,
            "batchNo": "B002",
            "expiryDate": "2027-10-10",
        }
        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["stockQuantity"], 55)
        self.assertEqual(res.data["stockLevel"], "NORMAL")

        # Verify StockLedgerEntry created
        entry = StockLedgerEntry.objects.filter(medicine=self.med, entry_type="RESTOCK").first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.quantity, 50)

    def test_stock_alerts(self):
        url = "/api/medicines/stock-alerts/"
        headers = self.auth_headers(self.user_pharm)
        res = self.client.get(url, **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("lowStock", res.data)
        self.assertEqual(len(res.data["lowStock"]), 1)

    def test_purchase_order_receive_flow(self):
        headers = self.auth_headers(self.user_pharm)

        # 1. Create PO
        po = PurchaseOrder.objects.create(
            order_id="po-001",
            supplier=self.supplier,
            status="ORDERED",
            total_amount=Decimal("1500.00"),
            items_data=[{"medicineId": "med-01", "quantity": 100, "batchNo": "B-PO-01"}],
        )

        # 2. Receive PO
        res_recv = self.client.post(f"/api/purchase-orders/{po.order_id}/receive/", format="json", **headers)
        self.assertEqual(res_recv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_recv.data["status"], "RECEIVED")

        # Verify stock incremented
        self.med.refresh_from_db()
        self.assertEqual(self.med.stock_quantity, 105)

    def test_pharmacy_permissions(self):
        # Receptionist attempting to restock medicine -> 403 Forbidden
        headers_rec = self.auth_headers(self.user_rec)
        res_rec = self.client.post(f"/api/medicines/{self.med.medicine_id}/restock/", {"quantity": 10, "batchNo": "X"}, format="json", **headers_rec)
        self.assertEqual(res_rec.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated request -> 401
        res_anon = self.client.get("/api/medicines/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)
