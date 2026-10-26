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
import json
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Notification, Role, Staff, User
from cms_pharmapp.models import Medicine, Supplier, PurchaseOrder, StockLedgerEntry
from cms_pharmapp.serializers import SupplierSerializer
from cms_doctorapp.models import Doctor, Prescription, PrescriptionItem
from cms_recepapp.models import Patient


class PharmacyDomainTests(APITestCase):
    def setUp(self):
        self.valid_expiry = (datetime.date.today() + datetime.timedelta(days=365)).isoformat()
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
            batches=[{
                "batchNo": "B001",
                "quantity": 5,
                "expiryDate": self.valid_expiry,
                "location": "COUNTER",
            }],
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

    def create_test_prescription(self, quantity=5):
        doctor_staff = Staff.objects.create(
            staff_id="staff-doc-01",
            name="Doctor Test",
            email="doctor@clinova.test",
            role=self.role_doc,
            is_active=True,
        )
        doctor = Doctor.objects.create(doctor_id="doctor-01", staff=doctor_staff)
        patient = Patient.objects.create(patient_id="patient-01", name="Patient Test")
        prescription = Prescription.objects.create(
            prescription_id="rx-test-01",
            patient=patient,
            doctor=doctor,
            date_issued=datetime.date.today(),
        )
        item = PrescriptionItem.objects.create(
            item_id="rx-item-01",
            prescription=prescription,
            medicine=self.med,
            dosage="1-0-1",
            frequency="twice daily",
            duration_days=3,
            quantity=quantity,
        )
        return prescription, item

    def record_dispensed_quantity(self, quantity):
        return StockLedgerEntry.objects.create(
            medicine=self.med,
            entry_type="DISPENSE",
            quantity=-quantity,
            reference_id="rx-usage-test",
        )

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
        self.med.storage_quantity = 50
        self.med.batches.append({
            "batchNo": "B002",
            "quantity": 50,
            "expiryDate": (datetime.date.today() + datetime.timedelta(days=180)).isoformat(),
            "location": "STORAGE",
        })
        self.med.save(update_fields=["storage_quantity", "batches"])

        payload = {
            "quantity": 50,
            "batchNo": "B002",
        }
        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["stockQuantity"], 55)
        self.assertEqual(res.data["storageStock"], 0)
        self.assertEqual(res.data["totalStock"], 55)
        self.assertEqual(res.data["stockLevel"], "NORMAL")

        # Verify StockLedgerEntry created
        entry = StockLedgerEntry.objects.filter(medicine=self.med, entry_type="RESTOCK").first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.quantity, 50)

        ledger_response = self.client.get("/api/stock-ledger/", **headers)
        self.assertEqual(ledger_response.status_code, status.HTTP_200_OK)
        self.assertIn("referenceId", ledger_response.data["results"][0])
        self.assertNotIn("reference_id", ledger_response.data["results"][0])

    def test_stock_alerts(self):
        url = "/api/medicines/stock-alerts/"
        headers = self.auth_headers(self.user_pharm)
        res = self.client.get(url, **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("lowStock", res.data)
        self.assertEqual(len(res.data["lowStock"]), 1)

    def test_new_prescription_notifies_pharmacy_role(self):
        prescription, _ = self.create_test_prescription()
        notification = Notification.objects.get(
            notification_type="PHARMACY_PRESCRIPTION",
            target_role="PHARMACIST",
        )
        self.assertEqual(notification.title, "New prescription received")
        self.assertIn(prescription.prescription_id, notification.message)
        self.assertEqual(
            notification.link,
            f"/pharmacy/prescription-queue?search={prescription.prescription_id}",
        )

        prescription.notes = "Updated after creation"
        prescription.save(update_fields=["notes"])
        self.assertEqual(
            Notification.objects.filter(
                notification_type="PHARMACY_PRESCRIPTION",
                target_role="PHARMACIST",
            ).count(),
            1,
        )

        response = self.client.get(
            "/api/notifications/",
            **self.auth_headers(self.user_pharm),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(
            row["id"] == notification.notification_id
            for row in response.data["results"]
        ))

    def test_supplier_catalogue_keeps_fixed_price_in_paise(self):
        headers = self.auth_headers(self.user_pharm)
        response = self.client.patch(
            f"/api/suppliers/{self.supplier.supplier_id}/",
            {"typicalMedicines": [{"medicineId": self.med.medicine_id, "unitCost": 275}]},
            format="json",
            **headers,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["typicalMedicines"], [{
            "medicineId": self.med.medicine_id,
            "fixedUnitPrice": 275,
        }])
        purchase_response = self.client.post(
            "/api/purchase-orders/",
            {
                "supplierId": self.supplier.supplier_id,
                "expectedDate": (datetime.date.today() + datetime.timedelta(days=30)).isoformat(),
                "items": [{"medicineId": self.med.medicine_id, "quantity": 2}],
            },
            format="json",
            **headers,
        )
        self.assertEqual(purchase_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(purchase_response.data["items"][0]["unitCost"], 275)

        duplicate = self.client.patch(
            f"/api/suppliers/{self.supplier.supplier_id}/",
            {"typicalMedicines": [
                {"medicineId": self.med.medicine_id, "unitCost": 275},
                {"medicineId": self.med.medicine_id, "unitCost": 300},
            ]},
            format="json",
            **headers,
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

        legacy_supplier = Supplier.objects.create(
            supplier_id="sup-legacy",
            name="Legacy Supplier",
            typical_medicines=[{"medicineId": self.med.medicine_id, "rate": 325}],
            is_active=True,
        )
        self.assertEqual(
            SupplierSerializer(legacy_supplier).data["typicalMedicines"],
            [{"medicineId": self.med.medicine_id, "rate": 325}],
        )

    def test_purchase_order_receive_flow(self):
        headers = self.auth_headers(self.user_pharm)
        self.record_dispensed_quantity(100)

        # 1. Create PO
        po = PurchaseOrder.objects.create(
            order_id="po-001",
            supplier=self.supplier,
            status=PurchaseOrder.Status.ORDERED,
            total_amount=Decimal("150.00"),
            items_data=[{
                "medicineId": "med-01",
                "quantity": 100,
            }],
        )

        delivery_url = f"/api/purchase-orders/{po.order_id}/deliver/"
        delivery_data = {
            "items": [{
                "medicineId": "med-01",
                "quantity": 100,
                "batchNo": "B-PO-01",
                "expiryDate": (datetime.date.today() + datetime.timedelta(days=90)).isoformat(),
            }],
        }
        delivered = self.client.post(delivery_url, delivery_data, format="json", **headers)
        self.assertEqual(delivered.status_code, status.HTTP_200_OK)
        self.assertEqual(delivered.data["status"], PurchaseOrder.Status.DELIVERED)
        no_revert = self.client.patch(
            f"/api/purchase-orders/{po.order_id}/",
            {"status": PurchaseOrder.Status.ORDERED},
            format="json",
            **headers,
        )
        self.assertEqual(no_revert.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        cannot_cancel_delivered = self.client.post(
            f"/api/purchase-orders/{po.order_id}/cancel/",
            format="json",
            **headers,
        )
        self.assertEqual(cannot_cancel_delivered.status_code, status.HTTP_400_BAD_REQUEST)
        self.med.refresh_from_db()
        self.assertEqual(self.med.stock_quantity, 5)
        self.assertEqual(self.med.storage_quantity, 0)

        stocked = self.client.post(f"/api/purchase-orders/{po.order_id}/stock/", format="json", **headers)
        self.assertEqual(stocked.status_code, status.HTTP_200_OK)
        self.assertEqual(stocked.data["status"], PurchaseOrder.Status.STOCKING)
        self.med.refresh_from_db()
        self.assertEqual(self.med.storage_quantity, 100)
        self.assertEqual(StockLedgerEntry.objects.filter(reference_id=po.order_id, entry_type="PURCHASE").count(), 1)

        duplicate_stock = self.client.post(f"/api/purchase-orders/{po.order_id}/stock/", format="json", **headers)
        self.assertEqual(duplicate_stock.status_code, status.HTTP_400_BAD_REQUEST)

    def test_purchase_order_create_uses_paise_for_item_costs(self):
        headers = self.auth_headers(self.user_pharm)
        self.record_dispensed_quantity(40)
        payload = {
            "supplierId": self.supplier.supplier_id,
            "status": "ORDERED",
            "expectedDate": (datetime.date.today() + datetime.timedelta(days=30)).isoformat(),
            "items": [{"medicineId": self.med.medicine_id, "quantity": 2, "unitCost": 1250}],
        }

        response = self.client.post("/api/purchase-orders/", payload, format="json", **headers)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["totalAmount"], 300)
        self.assertEqual(response.data["items"][0]["unitCost"], 150)
        self.assertEqual(response.data["createdBy"], self.staff_pharm.staff_id)
        order = PurchaseOrder.objects.get(pk=response.data["id"])
        self.assertEqual(order.total_amount, Decimal("3.00"))

    def test_medicine_without_dispensing_history_uses_initial_order_limit(self):
        payload = {
            "supplierId": self.supplier.supplier_id,
            "expectedDate": (datetime.date.today() + datetime.timedelta(days=30)).isoformat(),
            "items": [{"medicineId": self.med.medicine_id, "quantity": 400}],
        }
        headers = self.auth_headers(self.user_pharm)

        allowed = self.client.post("/api/purchase-orders/", payload, format="json", **headers)

        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED)
        payload["items"][0]["quantity"] = 401
        over_limit = self.client.post("/api/purchase-orders/", payload, format="json", **headers)
        self.assertEqual(over_limit.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("400-unit limit", str(over_limit.data))

    def test_purchase_order_rejects_unlisted_medicines_and_over_limit_quantity(self):
        headers = self.auth_headers(self.user_pharm)
        self.record_dispensed_quantity(12)
        payload = {
            "supplierId": self.supplier.supplier_id,
            "expectedDate": (datetime.date.today() + datetime.timedelta(days=30)).isoformat(),
            "items": [{"medicineId": self.med.medicine_id, "quantity": 13}],
        }
        over_limit = self.client.post("/api/purchase-orders/", payload, format="json", **headers)
        self.assertEqual(over_limit.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("3-month limit", str(over_limit.data))

        self.supplier.typical_medicines = []
        self.supplier.save(update_fields=["typical_medicines"])
        unlisted = self.client.post("/api/purchase-orders/", payload, format="json", **headers)
        self.assertEqual(unlisted.status_code, status.HTTP_400_BAD_REQUEST)

    def test_purchase_order_requires_valid_expected_date(self):
        self.record_dispensed_quantity(10)
        payload = {
            "supplierId": self.supplier.supplier_id,
            "items": [{"medicineId": self.med.medicine_id, "quantity": 2}],
        }
        headers = self.auth_headers(self.user_pharm)
        missing = self.client.post("/api/purchase-orders/", payload, format="json", **headers)
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)

        payload["expectedDate"] = (datetime.date.today() + datetime.timedelta(days=120)).isoformat()
        too_far = self.client.post("/api/purchase-orders/", payload, format="json", **headers)
        self.assertEqual(too_far.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancelled_order_cannot_be_delivered_and_adds_no_stock(self):
        po = PurchaseOrder.objects.create(
            order_id="po-cancel",
            supplier=self.supplier,
            status=PurchaseOrder.Status.ORDERED,
            items_data=[{"medicineId": self.med.medicine_id, "quantity": 5}],
        )
        headers = self.auth_headers(self.user_pharm)
        cancelled = self.client.post(f"/api/purchase-orders/{po.order_id}/cancel/", format="json", **headers)
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        self.assertEqual(cancelled.data["status"], PurchaseOrder.Status.CANCELLED)

        delivered = self.client.post(
            f"/api/purchase-orders/{po.order_id}/deliver/",
            {"items": [{
                "medicineId": self.med.medicine_id,
                "quantity": 5,
                "batchNo": "B-CANCEL",
                "expiryDate": (datetime.date.today() + datetime.timedelta(days=60)).isoformat(),
            }]},
            format="json",
            **headers,
        )
        self.assertEqual(delivered.status_code, status.HTTP_400_BAD_REQUEST)
        self.med.refresh_from_db()
        self.assertEqual(self.med.stock_quantity, 5)
        self.assertEqual(self.med.storage_quantity, 0)

    def test_inactive_medicine_cannot_be_added_to_purchase_order(self):
        self.med.is_active = False
        self.med.save(update_fields=["is_active"])
        response = self.client.post(
            "/api/purchase-orders/",
            {
                "supplierId": self.supplier.supplier_id,
                "status": "ORDERED",
                "expectedDate": (datetime.date.today() + datetime.timedelta(days=30)).isoformat(),
                "items": [{"medicineId": self.med.medicine_id, "quantity": 2, "unitCost": 1250}],
            },
            format="json",
            **self.auth_headers(self.user_pharm),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_purchase_receipt_requires_expiry_within_one_year(self):
        po = PurchaseOrder.objects.create(
            order_id="po-expiry",
            supplier=self.supplier,
            status="ORDERED",
            items_data=[{"medicineId": self.med.medicine_id, "quantity": 10, "batchNo": "B-EXP"}],
        )
        headers = self.auth_headers(self.user_pharm)

        def post_delivery(expiry_date=None):
            item = {
                "medicineId": self.med.medicine_id,
                "quantity": 10,
                "batchNo": "B-EXP",
            }
            if expiry_date:
                item["expiryDate"] = expiry_date
            return self.client.post(
                f"/api/purchase-orders/{po.order_id}/deliver/",
                {"items": [item]},
                format="json",
                **headers,
            )

        missing_expiry = post_delivery()
        self.assertEqual(missing_expiry.status_code, status.HTTP_400_BAD_REQUEST)

        excessive_expiry = post_delivery((datetime.date.today() + datetime.timedelta(days=400)).isoformat())
        self.assertEqual(excessive_expiry.status_code, status.HTTP_400_BAD_REQUEST)

        valid_expiry = post_delivery((datetime.date.today() + datetime.timedelta(days=90)).isoformat())
        self.assertEqual(valid_expiry.status_code, status.HTTP_200_OK)
        self.assertEqual(valid_expiry.data["status"], PurchaseOrder.Status.DELIVERED)
        self.med.refresh_from_db()
        self.assertEqual(self.med.storage_quantity, 0)
        stocked = self.client.post(f"/api/purchase-orders/{po.order_id}/stock/", format="json", **headers)
        self.assertEqual(stocked.status_code, status.HTTP_200_OK)
        self.med.refresh_from_db()
        self.assertEqual(self.med.storage_quantity, 10)

    def test_pharmacy_permissions(self):
        # Receptionist attempting to restock medicine -> 403 Forbidden
        headers_rec = self.auth_headers(self.user_rec)
        res_rec = self.client.post(f"/api/medicines/{self.med.medicine_id}/restock/", {"quantity": 10, "batchNo": "X"}, format="json", **headers_rec)
        self.assertEqual(res_rec.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated request -> 401
        res_anon = self.client.get("/api/medicines/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pharmacy_dispensing_supports_repeat_partial_dispense(self):
        prescription, item = self.create_test_prescription(quantity=5)
        url = f"/api/pharmacy-prescriptions/{prescription.pk}/dispense/"
        headers = self.auth_headers(self.user_pharm)

        first = self.client.post(
            url,
            {"items": [{"itemId": item.pk, "quantity": 2, "durationDays": 1}]},
            format="json",
            **headers,
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["status"], Prescription.Status.PARTIALLY_DISPENSED)
        self.assertEqual(first.data["dispensing"]["items"][0]["quantity"], 2)
        self.assertEqual(first.data["dispensing"]["items"][0]["durationDays"], 1)
        self.assertEqual(first.data["dispensing"]["items"][0]["batchNo"], "B001")
        ledger = StockLedgerEntry.objects.get(reference_id=prescription.pk)
        self.assertEqual(ledger.quantity, -2)
        self.assertEqual(ledger.batch_no, "B001")
        self.assertEqual(json.loads(ledger.note)["durationDays"], 1)

        self.med.refresh_from_db()
        self.med.batches = [{
            "batchNo": "B001",
            "quantity": self.med.batches[0]["quantity"],
            "expiryDate": self.valid_expiry,
            "location": "COUNTER",
        }, {
            "batchNo": "B002",
            "quantity": 3,
            "expiryDate": (datetime.date.today() + datetime.timedelta(days=730)).isoformat(),
            "location": "COUNTER",
        }]
        self.med.stock_quantity = 6
        self.med.save(update_fields=["batches", "stock_quantity"])
        preview = self.client.get(url, **headers)
        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        self.assertEqual(preview.data["items"][0]["remainingQuantity"], 3)
        self.assertEqual(preview.data["dispensing"]["items"][0]["quantity"], 2)
        self.assertEqual(preview.data["dispensing"]["items"][0]["batchNo"], "B001")
        self.assertEqual(preview.data["dispensing"]["items"][0]["durationDays"], 1)

        second = self.client.post(
            url,
            {"items": [{"itemId": item.pk, "quantity": 3, "durationDays": 2}]},
            format="json",
            **headers,
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data["status"], Prescription.Status.DISPENSED)
        self.assertEqual(StockLedgerEntry.objects.filter(reference_id=prescription.pk).count(), 2)

    def test_pharmacy_dispensing_allocates_non_expired_batches_fefo(self):
        prescription, item = self.create_test_prescription(quantity=4)
        today = datetime.date.today()
        self.med.batches = [{
            "batchNo": "LATER",
            "quantity": 3,
            "expiryDate": (today + datetime.timedelta(days=10)).isoformat(),
            "location": "COUNTER",
        }, {
            "batchNo": "SOONER",
            "quantity": 2,
            "expiryDate": (today + datetime.timedelta(days=2)).isoformat(),
            "location": "COUNTER",
        }]
        self.med.stock_quantity = 5
        self.med.save(update_fields=["batches", "stock_quantity"])

        response = self.client.post(
            f"/api/pharmacy-prescriptions/{prescription.pk}/dispense/",
            {"items": [{"itemId": item.pk, "quantity": 4, "durationDays": 2}]},
            format="json",
            **self.auth_headers(self.user_pharm),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entries = list(StockLedgerEntry.objects.filter(reference_id=prescription.pk).order_by("created_at", "entry_id"))
        self.assertEqual([(entry.batch_no, entry.quantity) for entry in entries], [("SOONER", -2), ("LATER", -2)])

    def test_pharmacy_dispensing_rejects_expired_stock_and_inactive_medicine(self):
        prescription, item = self.create_test_prescription(quantity=2)
        url = f"/api/pharmacy-prescriptions/{prescription.pk}/dispense/"
        headers = self.auth_headers(self.user_pharm)
        over_limit_response = self.client.post(
            url,
            {"items": [{"itemId": item.pk, "quantity": 3, "durationDays": 2}]},
            format="json",
            **headers,
        )
        self.assertEqual(over_limit_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(StockLedgerEntry.objects.filter(reference_id=prescription.pk).count(), 0)

        self.med.batches = [{
            "batchNo": "EXPIRED",
            "quantity": 5,
            "expiryDate": (datetime.date.today() - datetime.timedelta(days=1)).isoformat(),
            "location": "COUNTER",
        }]
        self.med.save(update_fields=["batches"])

        expired_response = self.client.post(
            url,
            {"items": [{"itemId": item.pk, "quantity": 1, "durationDays": 1}]},
            format="json",
            **headers,
        )
        self.assertEqual(expired_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(StockLedgerEntry.objects.filter(reference_id=prescription.pk).count(), 0)

        self.med.is_active = False
        self.med.save(update_fields=["is_active"])
        inactive_response = self.client.post(
            url,
            {"items": [{"itemId": item.pk, "quantity": 1, "durationDays": 1}]},
            format="json",
            **headers,
        )
        self.assertEqual(inactive_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(StockLedgerEntry.objects.filter(reference_id=prescription.pk).count(), 0)

    def test_remove_expired_batches_updates_both_stock_zones_and_ledger(self):
        headers = self.auth_headers(self.user_pharm)
        today = datetime.date.today()
        self.med.batches = [
            {
                "batchNo": "COUNTER-OLD",
                "quantity": 2,
                "expiryDate": (today - datetime.timedelta(days=1)).isoformat(),
                "location": "COUNTER",
            },
            {
                "batchNo": "COUNTER-UNDATED",
                "quantity": 1,
                "location": "COUNTER",
            },
            {
                "batchNo": "COUNTER-VALID",
                "quantity": 2,
                "expiryDate": (today + datetime.timedelta(days=30)).isoformat(),
                "location": "COUNTER",
            },
            {
                "batchNo": "STORAGE-OLD",
                "quantity": 4,
                "expiryDate": (today - datetime.timedelta(days=1)).isoformat(),
                "location": "STORAGE",
            },
        ]
        self.med.stock_quantity = 5
        self.med.storage_quantity = 4
        self.med.save(update_fields=["batches", "stock_quantity", "storage_quantity"])

        response = self.client.post(
            f"/api/medicines/{self.med.medicine_id}/remove-expired/",
            format="json",
            **headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(sum(batch["quantity"] for batch in response.data["removed"]), 7)
        self.med.refresh_from_db()
        self.assertEqual(self.med.stock_quantity, 2)
        self.assertEqual(self.med.storage_quantity, 0)
        self.assertEqual(StockLedgerEntry.objects.filter(medicine=self.med, entry_type="EXPIRED_REMOVAL").count(), 3)

    def test_medicine_capacity_and_reorder_level_validation(self):
        headers = self.auth_headers(self.user_pharm)
        invalid = self.client.patch(
            f"/api/medicines/{self.med.medicine_id}/",
            {"counterCapacity": 4, "reorderThreshold": 5},
            format="json",
            **headers,
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

        valid = self.client.patch(
            f"/api/medicines/{self.med.medicine_id}/",
            {"counterCapacity": 10, "reorderThreshold": 5},
            format="json",
            **headers,
        )
        self.assertEqual(valid.status_code, status.HTTP_200_OK)
        self.assertEqual(valid.data["counterCapacity"], 10)
        self.assertEqual(valid.data["reorderThreshold"], 5)
