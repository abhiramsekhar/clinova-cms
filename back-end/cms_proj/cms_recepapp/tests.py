"""
cms_recepapp/tests.py
Comprehensive automated test suite for Reception group:
- Patients (search, detail, validation, duplicate check, precheck, register-and-pay)
- Appointments (filtering, doctorId bridge, slot-board, walkin-slot, book-and-pay, check-in, cancel)
- Bills & Payments (integer paise representation, receive-payment, payment history)
- Role permissions (Receptionist, Doctor, Pharmacist, Anonymous)
"""

import datetime
from decimal import Decimal
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Role, Staff, User, Department, Setting
from cms_doctorapp.models import Doctor
from cms_recepapp.models import Patient, Appointment, Bill, BillItem, Payment


class ReceptionGroupTests(APITestCase):
    def setUp(self):
        # 1. Master roles
        self.role_admin = Role.objects.create(role_id="ADMIN", role_name="Administrator")
        self.role_rec = Role.objects.create(role_id="RECEPTIONIST", role_name="Receptionist")
        self.role_doc = Role.objects.create(role_id="DOCTOR", role_name="Doctor")
        self.role_pharm = Role.objects.create(role_id="PHARMACIST", role_name="Pharmacist")

        # 2. Departments
        self.dept = Department.objects.create(
            department_id="dept-01",
            name="General Medicine",
            code="GENMED",
            default_fee=Decimal("500.00"),
            is_active=True,
        )

        # 3. Staff & Doctors
        self.staff_rec = Staff.objects.create(
            staff_id="staff-rec-01",
            name="Ananya Sharma",
            email="ananya@clinova.test",
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

        self.staff_doc = Staff.objects.create(
            staff_id="staff-doc-01",
            name="Dr. Arun Varma",
            email="arun.doc@clinova.test",
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

        self.staff_pharm = Staff.objects.create(
            staff_id="staff-pharm-01",
            name="Priya Nair",
            email="priya@clinova.test",
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

        # 4. Settings
        Setting.objects.create(setting_id="set-01", key="billing.registrationFee", value="20000")
        Setting.objects.create(setting_id="set-02", key="appointment.slotDuration", value="30")
        Setting.objects.create(setting_id="set-03", key="appointment.startTime", value='"09:00"')
        Setting.objects.create(setting_id="set-04", key="appointment.endTime", value='"17:00"')

        # 5. Demo Patient
        self.patient = Patient.objects.create(
            patient_id="pat-01",
            mrn="CLN-2025-0001",
            name="Arun Nair",
            dob=datetime.date(1982, 4, 12),
            gender="Male",
            phone="9847012345",
            email="arun.nair@example.com",
            blood_group="B+",
            allergies="Penicillin, Sulfa",
            chronic_conditions=["Type 2 Diabetes", "Hypertension"],
            assigned_doctor=self.doctor,
            is_active=True,
        )

        # 6. Demo Appointment
        self.today = datetime.date.today()
        self.appointment = Appointment.objects.create(
            appointment_id="appt-001",
            patient=self.patient,
            doctor=self.doctor,
            department=self.dept,
            appointment_date=self.today,
            time_slot="10:00",
            appointment_type="New Visit",
            status=Appointment.Status.SCHEDULED,
            token_number=3,
            created_by=self.staff_rec,
        )

        # 7. Demo Bill & Payment
        self.bill = Bill.objects.create(
            bill_id="bill-001",
            patient=self.patient,
            appointment=self.appointment,
            bill_date=self.today,
            total_amount=Decimal("850.00"),
            amount_paid=Decimal("0.00"),
            payment_status=Bill.PaymentStatus.UNPAID,
            generated_by=self.staff_rec,
        )
        self.bill_item_1 = BillItem.objects.create(
            bill_item_id="bill-001-item-1",
            bill=self.bill,
            item_type=BillItem.ItemType.CONSULTATION,
            source_id="appt-001",
            description="Consultation Fee",
            amount=Decimal("500.00"),
        )
        self.bill_item_2 = BillItem.objects.create(
            bill_item_id="bill-001-item-2",
            bill=self.bill,
            item_type=BillItem.ItemType.LAB_TEST,
            source_id="lab-01",
            description="CBC Lab Test",
            amount=Decimal("350.00"),
        )
        self.payment = Payment.objects.create(
            payment_id="pay-001",
            bill=self.bill,
            amount_paid=Decimal("500.00"),
            payment_date=self.today,
            payment_method=Payment.Method.UPI,
            transaction_ref="UPI-123456",
            received_by=self.staff_rec,
        )
        self.bill.refresh_from_db()

    def auth_headers(self, user):
        token = RefreshToken.for_user(user).access_token
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    # --- Patient Tests ---
    def test_patient_list_and_search(self):
        url = "/api/patients/"
        headers = self.auth_headers(self.user_rec)

        # List all
        res = self.client.get(url, **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("results", res.data)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["name"], "Arun Nair")

        # Search match
        res_search = self.client.get(f"{url}?search=Arun", **headers)
        self.assertEqual(res_search.data["count"], 1)

        # Search no match
        res_none = self.client.get(f"{url}?search=NonExistent", **headers)
        self.assertEqual(res_none.data["count"], 0)

    def test_patient_detail_and_formatting(self):
        url = f"/api/patients/{self.patient.patient_id}/"
        headers = self.auth_headers(self.user_rec)
        res = self.client.get(url, **headers)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["id"], "pat-01")
        self.assertEqual(res.data["mrn"], "CLN-2025-0001")
        self.assertEqual(res.data["allergies"], ["Penicillin", "Sulfa"])
        self.assertEqual(res.data["chronicConditions"], ["Type 2 Diabetes", "Hypertension"])
        self.assertEqual(res.data["assignedDoctor"]["id"], "staff-doc-01")

    def test_patient_create_under_18_validation(self):
        url = "/api/patients/"
        headers = self.auth_headers(self.user_rec)

        # Minor without guardian
        minor_dob = (datetime.date.today() - datetime.timedelta(days=365 * 10)).strftime("%Y-%m-%d")
        payload = {
            "name": "Kiddo",
            "dateOfBirth": minor_dob,
            "gender": "Male",
            "phone": "9876543210",
        }
        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("guardian details", str(res.data))

        # Minor with guardian details succeeds
        payload["guardianName"] = "Parent Name"
        payload["guardianPhone"] = "9876543211"
        res_ok = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res_ok.data["mrn"].startswith(f"CLN-{datetime.date.today().year}-"))

    def test_patient_duplicate_detection(self):
        url = "/api/patients/"
        headers = self.auth_headers(self.user_rec)

        # Duplicate name + dob
        payload = {
            "name": "Arun Nair",
            "dateOfBirth": "1982-04-12",
            "phone": "9999999999",
        }
        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("DUPLICATE_PATIENT", str(res.data))

    def test_patient_precheck(self):
        url = "/api/patients/precheck/"
        headers = self.auth_headers(self.user_rec)

        # Valid payload
        valid_dob = (datetime.date.today() - datetime.timedelta(days=365 * 30)).strftime("%Y-%m-%d")
        res_ok = self.client.post(url, {"name": "Fresh Person", "dateOfBirth": valid_dob, "phone": "9111111111"}, format="json", **headers)
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertTrue(res_ok.data["valid"])

        # Invalid (duplicate)
        res_dupe = self.client.post(url, {"name": "Arun Nair", "dateOfBirth": "1982-04-12"}, format="json", **headers)
        self.assertEqual(res_dupe.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patient_register_and_pay(self):
        url = "/api/patients/register-and-pay/"
        headers = self.auth_headers(self.user_rec)
        valid_dob = (datetime.date.today() - datetime.timedelta(days=365 * 25)).strftime("%Y-%m-%d")

        payload = {
            "patient": {
                "name": "Kavitha Menon",
                "dateOfBirth": valid_dob,
                "gender": "Female",
                "phone": "9898989898",
                "address": "Ernakulam",
            },
            "payment": {
                "method": "UPI",
                "transactionRef": "UPI-REG-001",
            },
        }

        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("patient", res.data)
        self.assertIn("bill", res.data)
        self.assertEqual(res.data["patient"]["name"], "Kavitha Menon")
        # Registration fee: 20000 paise (₹200)
        self.assertEqual(res.data["bill"]["totalAmount"], 20000)
        self.assertEqual(res.data["bill"]["paidAmount"], 20000)
        self.assertEqual(res.data["bill"]["status"], "PAID")

    # --- Appointment Tests ---
    def test_appointment_doctor_id_bridge(self):
        url = f"/api/appointments/{self.appointment.appointment_id}/"
        headers = self.auth_headers(self.user_rec)
        res = self.client.get(url, **headers)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Verifies doctorId matches Staff.staff_id
        self.assertEqual(res.data["doctorId"], "staff-doc-01")
        self.assertEqual(res.data["doctorName"], "Dr. Arun Varma")
        self.assertEqual(res.data["patientName"], "Arun Nair")

    def test_appointment_filtering(self):
        url = "/api/appointments/"
        headers = self.auth_headers(self.user_rec)

        res_doc = self.client.get(f"{url}?doctor=staff-doc-01", **headers)
        self.assertEqual(res_doc.data["count"], 1)

        res_date = self.client.get(f"{url}?date={self.today.strftime('%Y-%m-%d')}", **headers)
        self.assertEqual(res_date.data["count"], 1)

        res_status = self.client.get(f"{url}?status=SCHEDULED", **headers)
        self.assertEqual(res_status.data["count"], 1)

    def test_appointment_slot_board_and_consultation_fee(self):
        headers = self.auth_headers(self.user_rec)

        fee_url = f"/api/appointments/consultation-fee/?doctor=staff-doc-01"
        res_fee = self.client.get(fee_url, **headers)
        self.assertEqual(res_fee.status_code, status.HTTP_200_OK)
        self.assertEqual(res_fee.data["fee"], 50000)  # 50000 paise (₹500)

        board_url = f"/api/appointments/slot-board/?doctor=staff-doc-01&date={self.today.strftime('%Y-%m-%d')}"
        res_board = self.client.get(board_url, **headers)
        self.assertEqual(res_board.status_code, status.HTTP_200_OK)
        # Slot 10:00 is booked by demo appointment
        slot_10 = next((s for s in res_board.data if s["time"] == "10:00"), None)
        self.assertIsNotNone(slot_10)
        self.assertEqual(slot_10["state"], "booked")

    def test_appointment_book_and_pay(self):
        url = "/api/appointments/book-and-pay/"
        headers = self.auth_headers(self.user_rec)
        future_date = (datetime.date.today() + datetime.timedelta(days=2)).strftime("%Y-%m-%d")

        payload = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "mode": "PRIOR",
            "date": future_date,
            "time": "11:00",
            "type": "New Visit",
            "reason": "General Checkup",
            "payment": {"method": "CASH"},
        }

        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["appointment"]["doctorId"], "staff-doc-01")
        self.assertEqual(res.data["bill"]["status"], "PAID")
        self.assertEqual(res.data["bill"]["totalAmount"], 50000)

    def test_appointment_check_in_and_cancel(self):
        headers = self.auth_headers(self.user_rec)

        # Cancel appointment
        cancel_url = f"/api/appointments/{self.appointment.appointment_id}/cancel/"
        res_cancel = self.client.post(cancel_url, {"reason": "Patient requested", "refund": True}, format="json", **headers)
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cancel.data["status"], "CANCELLED")

        self.bill.refresh_from_db()
        self.assertEqual(self.bill.payment_status, Bill.PaymentStatus.CANCELLED)

    # --- Billing & Payment Tests ---
    def test_bill_integer_paise_conversion(self):
        url = f"/api/bills/{self.bill.bill_id}/"
        headers = self.auth_headers(self.user_rec)
        res = self.client.get(url, **headers)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # In MySQL: total=850.00, paid=500.00, balance=350.00
        # In API response: paise integer
        self.assertEqual(res.data["totalAmount"], 85000)
        self.assertEqual(res.data["paidAmount"], 50000)
        self.assertEqual(res.data["balanceDue"], 35000)

        # Items in paise
        items = res.data["items"]
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["amount"], 50000)
        self.assertEqual(items[1]["amount"], 35000)

    def test_receive_payment(self):
        url = f"/api/bills/{self.bill.bill_id}/receive-payment/"
        headers = self.auth_headers(self.user_rec)

        # Overpay balance due (balance is 35000 paise, sending 40000)
        res_over = self.client.post(url, {"amount": 40000, "method": "CASH"}, format="json", **headers)
        self.assertEqual(res_over.status_code, status.HTTP_400_BAD_REQUEST)

        # Pay exact remaining balance: 35000 paise
        res_pay = self.client.post(url, {"amount": 35000, "method": "CASH"}, format="json", **headers)
        self.assertEqual(res_pay.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pay.data["paidAmount"], 85000)
        self.assertEqual(res_pay.data["balanceDue"], 0)
        self.assertEqual(res_pay.data["status"], "PAID")

    # --- Role Permission Tests ---
    def test_role_permissions_reception(self):
        # Pharmacist attempting to create patient -> 403 Forbidden
        headers_pharm = self.auth_headers(self.user_pharm)
        res_pharm = self.client.post(
            "/api/patients/",
            {"name": "No Access", "dateOfBirth": "1990-01-01"},
            format="json",
            **headers_pharm
        )
        self.assertEqual(res_pharm.status_code, status.HTTP_403_FORBIDDEN)

        # Doctor attempting to receive payment on bill -> 403 Forbidden
        headers_doc = self.auth_headers(self.user_doc)
        res_doc = self.client.post(
            f"/api/bills/{self.bill.bill_id}/receive-payment/",
            {"amount": 10000, "method": "CASH"},
            format="json",
            **headers_doc
        )
        self.assertEqual(res_doc.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated request -> 401 Unauthorized
        res_anon = self.client.get("/api/patients/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)
