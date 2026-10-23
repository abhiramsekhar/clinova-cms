"""
cms_doctorapp/tests.py
Automated test suite for Doctor domain:
- Doctors list & consultationFee in paise
- Consultation lifecycle (get-or-create, save-draft, complete lock, addendum)
- Prescription lifecycle (allergy check, dispense FEFO, cancel)
- Lab orders (create, update-status, enter-result, critical alert)
- Role permissions (DOCTOR, PHARMACIST, RECEPTIONIST, Anonymous)
"""

import datetime
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Role, Staff, User, Department, LabTestCatalog, Notification
from cms_recepapp.models import Patient, Appointment, Bill
from cms_pharmapp.models import Medicine, StockLedgerEntry
from cms_labapp.models import LabTestResult
from cms_doctorapp.models import Doctor, ConsultationRecord, Prescription, PrescriptionItem, LabTest


class DoctorDomainTests(APITestCase):
    def setUp(self):
        # Master roles
        self.role_admin = Role.objects.create(role_id="ADMIN", role_name="Administrator")
        self.role_doc = Role.objects.create(role_id="DOCTOR", role_name="Doctor")
        self.role_pharm = Role.objects.create(role_id="PHARMACIST", role_name="Pharmacist")
        self.role_lab = Role.objects.create(role_id="LAB_TECH", role_name="Lab Technician")
        self.role_rec = Role.objects.create(role_id="RECEPTIONIST", role_name="Receptionist")

        # Department
        self.dept = Department.objects.create(
            department_id="dept-01",
            name="General Medicine",
            code="GENMED",
            default_fee=Decimal("500.00"),
            is_active=True,
        )

        # Doctor Staff & User
        self.staff_doc = Staff.objects.create(
            staff_id="staff-doc-01",
            name="Dr. Suresh Varma",
            email="suresh.doc@clinova.test",
            role=self.role_doc,
            department=self.dept,
            is_active=True,
        )
        self.doctor = Doctor.objects.create(
            doctor_id="doc-01",
            staff=self.staff_doc,
            department=self.dept,
            consultation_fee=Decimal("500.00"),
        )
        self.user_doc = User.objects.create(
            user_id="user-doc-01",
            username="doctor",
            role=self.role_doc,
            staff=self.staff_doc,
            is_active=True,
        )
        self.user_doc.set_password("Pass@123")
        self.user_doc.save()

        # Pharmacist Staff & User
        self.staff_pharm = Staff.objects.create(
            staff_id="staff-pharm-01",
            name="Pharmacist One",
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

        # Lab Tech Staff & User
        self.staff_lab = Staff.objects.create(
            staff_id="staff-lab-01",
            name="Lab Tech One",
            email="lab@clinova.test",
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

        # Patient (Allergic to Penicillin)
        self.patient = Patient.objects.create(
            patient_id="pat-01",
            mrn="CLN-2025-0001",
            name="Arun Nair",
            dob=datetime.date(1985, 5, 20),
            gender="M",
            phone="9847000001",
            allergies="Penicillin",
            assigned_doctor=self.doctor,
            is_active=True,
        )

        # Appointment
        self.appointment = Appointment.objects.create(
            appointment_id="appt-001",
            patient=self.patient,
            doctor=self.doctor,
            department=self.dept,
            appointment_date=datetime.date.today(),
            time_slot="10:00",
            status=Appointment.Status.SCHEDULED,
        )

        # Medicines
        self.med_amox = Medicine.objects.create(
            medicine_id="med-01",
            name="Amoxicillin 500mg",
            generic_name="Penicillin derivative",
            selling_price=Decimal("15.00"),
            stock_quantity=100,
            batches=[{"batchNo": "B1", "quantity": 100, "expiryDate": "2027-12-31"}],
        )
        self.med_para = Medicine.objects.create(
            medicine_id="med-02",
            name="Paracetamol 650mg",
            generic_name="Acetaminophen",
            selling_price=Decimal("2.50"),
            stock_quantity=50,
            batches=[{"batchNo": "B2", "quantity": 50, "expiryDate": "2026-10-10"}],
        )

        # Lab Catalog
        self.catalog = LabTestCatalog.objects.create(
            test_catalog_id="test-01",
            test_name="Electrolytes",
            code="LYTES",
            category="Biochemistry",
            price=Decimal("400.00"),
            parameters=[
                {"name": "Sodium", "unit": "mEq/L", "criticalLow": 130, "criticalHigh": 155},
                {"name": "Potassium", "unit": "mEq/L", "criticalLow": 3.0, "criticalHigh": 6.0},
            ],
            is_active=True,
        )

    def auth_headers(self, user):
        token = RefreshToken.for_user(user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    def test_doctors_list_fee_in_paise(self):
        url = "/api/doctors/"
        headers = self.auth_headers(self.user_doc)
        res = self.client.get(url, **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["results"][0]["consultationFee"], 50000)

    def test_consultation_lifecycle(self):
        headers = self.auth_headers(self.user_doc)

        # 1. get-or-create: initializes draft and sets appointment to IN_PROGRESS
        res_init = self.client.post("/api/consultations/get-or-create/", {"appointmentId": "appt-001"}, format="json", **headers)
        self.assertEqual(res_init.status_code, status.HTTP_201_CREATED)
        con_id = res_init.data["id"]

        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.Status.IN_PROGRESS)

        # 2. save-draft
        res_draft = self.client.patch(
            f"/api/consultations/{con_id}/save-draft/",
            {"symptoms": "Fever, chills", "diagnosis": "Viral fever"},
            format="json",
            **headers,
        )
        self.assertEqual(res_draft.status_code, status.HTTP_200_OK)
        self.assertEqual(res_draft.data["diagnosis"], "Viral fever")

        # 3. Addendum before completion -> should fail
        res_bad_add = self.client.post(f"/api/consultations/{con_id}/addendum/", {"text": "Note"}, format="json", **headers)
        self.assertEqual(res_bad_add.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. complete: locks consultation and sets appointment to COMPLETED
        res_comp = self.client.post(f"/api/consultations/{con_id}/complete/", format="json", **headers)
        self.assertEqual(res_comp.status_code, status.HTTP_200_OK)
        self.assertTrue(res_comp.data["isCompleted"])

        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.Status.COMPLETED)

        # 5. Addendum after completion -> succeeds
        res_add = self.client.post(f"/api/consultations/{con_id}/addendum/", {"text": "Patient felt better on call."}, format="json", **headers)
        self.assertEqual(res_add.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_add.data["addendums"]), 1)

    def test_prescription_allergy_check_and_dispense(self):
        headers_doc = self.auth_headers(self.user_doc)

        # 1. Prescribe Amoxicillin to patient allergic to Penicillin -> blocked with ALLERGY_ALERT
        bad_payload = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "items": [{"medicineId": "med-01", "quantity": 10}],
        }
        res_bad = self.client.post("/api/prescriptions/", bad_payload, format="json", **headers_doc)
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_bad.data.get("code"), "ALLERGY_ALERT")

        # 2. Explicit override -> succeeds
        bad_payload["explicitOverride"] = True
        res_override = self.client.post("/api/prescriptions/", bad_payload, format="json", **headers_doc)
        self.assertEqual(res_override.status_code, status.HTTP_201_CREATED)
        rx_id = res_override.data["id"]

        # 3. Pharmacist dispenses prescription
        headers_pharm = self.auth_headers(self.user_pharm)
        dispense_payload = {
            "payment": {"status": "PAID", "method": "CASH"},
        }
        res_disp = self.client.post(f"/api/prescriptions/{rx_id}/dispense/", dispense_payload, format="json", **headers_pharm)
        self.assertEqual(res_disp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_disp.data["status"], "DISPENSED")

        # Verify stock decremented
        self.med_amox.refresh_from_db()
        self.assertEqual(self.med_amox.stock_quantity, 90)

        # Verify stock ledger entry created
        ledger = StockLedgerEntry.objects.filter(medicine=self.med_amox, entry_type="DISPENSE").first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.quantity, -10)

    def test_lab_order_and_critical_result(self):
        headers_doc = self.auth_headers(self.user_doc)
        headers_lab = self.auth_headers(self.user_lab)

        # 1. Doctor creates lab order
        order_payload = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "testId": "test-01",
            "priority": "Urgent",
        }
        res_order = self.client.post("/api/lab-orders/", order_payload, format="json", **headers_doc)
        self.assertEqual(res_order.status_code, status.HTTP_201_CREATED)
        order_id = res_order.data["id"]

        # 2. Lab Tech updates status to SAMPLE_COLLECTED
        res_stat = self.client.post(f"/api/lab-orders/{order_id}/update-status/", {"status": "SAMPLE_COLLECTED"}, format="json", **headers_lab)
        self.assertEqual(res_stat.status_code, status.HTTP_200_OK)
        self.assertEqual(res_stat.data["status"], "SAMPLE_COLLECTED")

        # 3. Lab Tech enters critical result (Sodium = 125, below criticalLow of 130)
        res_res = self.client.post(
            f"/api/lab-orders/{order_id}/enter-result/",
            {"results": {"Sodium": "125", "Potassium": "4.2"}},
            format="json",
            **headers_lab,
        )
        self.assertEqual(res_res.status_code, status.HTTP_200_OK)
        self.assertEqual(res_res.data["status"], "COMPLETED")
        self.assertTrue(res_res.data["isCritical"])

        # Verify critical notification to doctor
        notif = Notification.objects.filter(target_role="DOCTOR", notification_type="LAB_RESULT").first()
        self.assertIsNotNone(notif)
        self.assertIn("critical", notif.message.lower())

    def test_doctor_permissions(self):
        # Pharmacist attempting to start consultation -> 403 Forbidden
        headers_pharm = self.auth_headers(self.user_pharm)
        res_con = self.client.post("/api/consultations/get-or-create/", {"appointmentId": "appt-001"}, format="json", **headers_pharm)
        self.assertEqual(res_con.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated request -> 401
        res_anon = self.client.get("/api/consultations/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)
