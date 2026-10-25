"""
cms_recepapp/tests.py
Comprehensive automated test suite for Reception group:
- Patients (search, detail, validation, duplicate check, precheck, register-and-pay)
- Appointments (filtering, doctorId bridge, slot-board, walkin-slot, book-and-pay, check-in, cancel)
- Bills & Payments (integer paise representation, receive-payment, payment history)
- Role permissions (Receptionist, Doctor, Pharmacist, Anonymous)
"""

import datetime
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import close_old_connections
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APIClient
from decimal import Decimal
from unittest.mock import patch
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Role, Staff, User, Department, Setting, AuditLog
from cms_doctorapp.models import Doctor
from cms_recepapp.models import Patient, Appointment, Bill, BillItem, Payment


class ReceptionGroupTests(APITestCase):
    def setUp(self):
        # Freeze the clinic clock so list-side No-show processing is deterministic.
        morning = timezone.make_aware(datetime.datetime.combine(timezone.localdate(), datetime.time(8, 0)))
        clock = patch("django.utils.timezone.now", return_value=morning)
        clock.start()
        self.addCleanup(clock.stop)
        # 1. Master roles
        self.role_admin = Role.objects.create(role_id="ADMIN", role_name="Administrator")
        self.role_rec = Role.objects.create(role_id="RECEPTIONIST", role_name="Receptionist")
        self.role_doc = Role.objects.create(role_id="DOCTOR", role_name="Doctor")
        self.role_pharm = Role.objects.create(role_id="PHARMACIST", role_name="Pharmacist")
        self.role_lab = Role.objects.create(role_id="LAB_TECH", role_name="Lab Technician")

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

        self.staff_lab = Staff.objects.create(
            staff_id="staff-lab-01",
            name="Arjun Pillai",
            email="arjun.lab@clinova.test",
            role=self.role_lab,
            is_active=True,
        )
        self.user_lab = User.objects.create(
            user_id="user-lab-01",
            username="labtechnician",
            role=self.role_lab,
            staff=self.staff_lab,
            is_active=True,
        )
        self.user_lab.set_password("Pass@123")
        self.user_lab.save()

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
        self.today = timezone.localdate()
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

        for term in ["pat-01", "CLN-2025-0001", "984701"]:
            result = self.client.get(f"{url}?search={term}", **headers)
            self.assertEqual(result.data["count"], 1, term)

    def test_patient_registration_date_views_use_registration_date_with_creation_fallback(self):
        headers = self.auth_headers(self.user_rec)
        self.assertEqual(self.client.get(f"/api/patients/?registration=today", **headers).data["count"], 1)
        Patient.objects.filter(pk=self.patient.patient_id).update(registered_on=timezone.localdate() - datetime.timedelta(days=1))
        self.assertEqual(self.client.get(f"/api/patients/?registration=today", **headers).data["count"], 0)
        previous = self.client.get("/api/patients/?registration=previous", **headers)
        self.assertEqual(previous.data["count"], 1)
        self.assertEqual(self.client.get("/api/patients/?registration=all", **headers).data["count"], 1)

        Patient.objects.filter(pk=self.patient.patient_id).update(registered_on=None, created_at=timezone.now() - datetime.timedelta(days=1))
        self.assertEqual(self.client.get("/api/patients/?registration=previous", **headers).data["count"], 1)

    def test_patient_edit_preserves_mrn_and_related_records(self):
        headers = self.auth_headers(self.user_rec)
        denied = self.client.patch(
            f"/api/patients/{self.patient.patient_id}/",
            {"phone": "9847012345"}, format="json", **self.auth_headers(self.user_doc),
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.patch(
            f"/api/patients/{self.patient.patient_id}/",
            {"name": "Arun Nair", "phone": "9847012345", "dateOfBirth": "1982-04-12", "gender": "Male", "address": "Updated 8 Lake Road, Kochi", "allergies": ["Penicillin", "Dust"]},
            format="json", **headers,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["mrn"], "CLN-2025-0001")
        self.assertEqual(response.data["allergies"], ["Penicillin", "Dust"])
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.patient_id, self.patient.patient_id)

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
            "address": "8 Lake Road, Kochi",
        }
        res = self.client.post(url, {**payload, "confirmPossibleDuplicate": True}, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("guardian details", str(res.data))

        # Minor with guardian details succeeds
        payload["guardianName"] = "Parent Name"
        payload["guardianPhone"] = "9876543211"
        res_ok = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res_ok.data["mrn"].startswith(f"CLN-{datetime.date.today().year}-"))

    def test_possible_duplicate_is_warned_but_not_blocked(self):
        url = "/api/patients/"
        headers = self.auth_headers(self.user_rec)

        # Duplicate name + dob
        payload = {
            "name": "Arun Nair",
            "dateOfBirth": "1982-04-12",
            "phone": "9999999999",
            "gender": "Male",
            "address": "8 Lake Road, Kochi",
        }
        needs_confirmation = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(needs_confirmation.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("potentialDuplicates", needs_confirmation.data)
        res = self.client.post(url, {**payload, "confirmPossibleDuplicate": True}, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_patient_precheck(self):
        url = "/api/patients/precheck/"
        headers = self.auth_headers(self.user_rec)

        # Valid payload
        valid_dob = (datetime.date.today() - datetime.timedelta(days=365 * 30)).strftime("%Y-%m-%d")
        res_ok = self.client.post(url, {"name": "Fresh Person", "dateOfBirth": valid_dob, "phone": "9111111111", "gender": "Other", "address": "1 MG Road, Kochi"}, format="json", **headers)
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertTrue(res_ok.data["valid"])

        # Potential duplicate is returned as a warning; it does not reject by itself.
        res_dupe = self.client.post(url, {"name": "Arun Nair", "dateOfBirth": "1982-04-12", "phone": "9847012345", "gender": "Male", "address": "8 Lake Road, Kochi"}, format="json", **headers)
        self.assertEqual(res_dupe.status_code, status.HTTP_200_OK)
        self.assertTrue(res_dupe.data["potentialDuplicates"])

    def test_patient_registration_validates_phone_address_gender_and_dob(self):
        headers = self.auth_headers(self.user_rec)
        payload = {"name": "Umma D K", "dateOfBirth": "1990-04-12", "gender": "Female", "phone": "5123456789", "address": "House 2/4, MG Road, Kochi - 682011"}
        response = self.client.post("/api/patients/", payload, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

        payload["phone"] = "9123456789"
        payload["address"] = "   "
        response = self.client.post("/api/patients/", payload, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("address", response.data)

    def test_patient_registration_saves_without_collecting_registration_fee(self):
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

        bill_count = Bill.objects.count()
        payment_count = Payment.objects.count()
        appointment_count = Appointment.objects.count()
        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("patient", res.data)
        self.assertEqual(res.data["patient"]["name"], "Kavitha Menon")
        self.assertTrue(Patient.objects.filter(pk=res.data["patient"]["id"]).exists())
        self.assertEqual(Bill.objects.count(), bill_count)
        self.assertEqual(Payment.objects.count(), payment_count)
        self.assertEqual(Appointment.objects.count(), appointment_count)

    def test_booking_rejects_unconfirmed_payment_without_creating_records(self):
        headers = self.auth_headers(self.user_rec)
        before_appointments, before_bills, before_payments = Appointment.objects.count(), Bill.objects.count(), Payment.objects.count()
        payload = {
            "patientId": self.patient.patient_id, "doctorId": self.staff_doc.staff_id,
            "mode": "PRIOR", "date": (self.today + datetime.timedelta(days=2)).isoformat(),
            "time": "11:00", "payment": {"method": "CASH"},
        }
        response = self.client.post("/api/appointments/book-and-pay/", payload, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "PAYMENT_NOT_CONFIRMED")
        self.assertEqual(Appointment.objects.count(), before_appointments)
        self.assertEqual(Bill.objects.count(), before_bills)
        self.assertEqual(Payment.objects.count(), before_payments)

    def test_booking_enforces_date_window_and_walkin_time_availability(self):
        headers = self.auth_headers(self.user_rec)
        base_payload = {
            "patientId": self.patient.patient_id, "doctorId": self.staff_doc.staff_id,
            "mode": "PRIOR", "time": "11:00", "payment": {"method": "CASH", "confirmed": True},
        }
        for invalid_date in [self.today, self.today - datetime.timedelta(days=1), self.today + datetime.timedelta(days=29)]:
            response = self.client.post(
                "/api/appointments/book-and-pay/",
                {**base_payload, "date": invalid_date.isoformat()}, format="json", **headers,
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(response.data["code"], "INVALID_APPOINTMENT_DATE")

        self.appointment.status = Appointment.Status.CANCELLED
        self.appointment.save(update_fields=["status"])
        walkin_payload = {
            "patientId": self.patient.patient_id, "doctorId": self.staff_doc.staff_id,
            "mode": "WALK_IN", "date": self.today.isoformat(), "time": "09:00",
            "payment": {"method": "CASH", "confirmed": True},
        }
        now = timezone.make_aware(
            datetime.datetime.combine(self.today, datetime.time(11, 0)),
            timezone.get_current_timezone(),
        )
        with patch("cms_recepapp.views.timezone.localtime", return_value=now), patch(
            "cms_recepapp.views.timezone.localdate", return_value=self.today
        ):
            past_slot = self.client.post("/api/appointments/book-and-pay/", walkin_payload, format="json", **headers)
        self.assertEqual(past_slot.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(past_slot.data["code"], "SLOT_UNAVAILABLE")

        walkin_payload["date"] = (self.today + datetime.timedelta(days=1)).isoformat()
        walkin_payload["time"] = "11:00"
        wrong_day = self.client.post("/api/appointments/book-and-pay/", walkin_payload, format="json", **headers)
        self.assertEqual(wrong_day.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(wrong_day.data["code"], "INVALID_APPOINTMENT_DATE")

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

        # A receptionist's search includes the patient's actual ID/MRN and is not
        # restricted to a date unless the caller explicitly supplies one.
        res_search = self.client.get(f"{url}?search=CLN-2025-0001", **headers)
        self.assertEqual(res_search.data["count"], 1)

        future = Appointment.objects.create(
            appointment_id="appt-002", patient=self.patient, doctor=self.doctor,
            department=self.dept, appointment_date=self.today + datetime.timedelta(days=1),
            time_slot="11:00", status=Appointment.Status.SCHEDULED,
            created_by=self.staff_rec,
        )
        booked_today = self.client.get(
            f"{url}?booked_date={timezone.localdate().isoformat()}", **headers
        )
        self.assertEqual(booked_today.data["count"], 2)
        self.assertIn(future.appointment_id, [row["id"] for row in booked_today.data["results"]])

        scheduled_today = self.client.get(
            f"{url}?date={self.today.isoformat()}", **headers
        )
        self.assertEqual(scheduled_today.data["count"], 1)
        searched = self.client.get(f"{url}?search=CLN-2025-0001", **headers)
        self.assertEqual(searched.data["results"][0]["id"], future.appointment_id)

    def test_appointment_views_distinguish_scheduled_date_from_booking_date(self):
        future = Appointment.objects.create(
            appointment_id="appt-099", patient=self.patient, doctor=self.doctor,
            department=self.dept, appointment_date=self.today + datetime.timedelta(days=2),
            time_slot="11:00", booking_mode=Appointment.BookingMode.PRIOR,
            status=Appointment.Status.SCHEDULED, created_by=self.staff_rec,
        )
        headers = self.auth_headers(self.user_rec)
        scheduled_today = self.client.get(
            f"/api/appointments/?date={self.today.isoformat()}", **headers,
        )
        booked_today = self.client.get(
            f"/api/appointments/?booked_date={timezone.localdate().isoformat()}", **headers,
        )
        self.assertEqual(scheduled_today.data["count"], 1)
        self.assertEqual(booked_today.data["count"], 2)
        self.assertNotIn(future.appointment_id, [row["id"] for row in scheduled_today.data["results"]])
        self.assertIn(future.appointment_id, [row["id"] for row in booked_today.data["results"]])

        for params in [
            {"exclude_today": "true"},
            {"exclude_today": "true", "booked_date": timezone.localdate().isoformat()},
            {"exclude_today": "true", "date": future.appointment_date.isoformat()},
            {"exclude_today": "true", "search": self.patient.mrn},
        ]:
            records = self.client.get("/api/appointments/", params, **headers)
            self.assertEqual(records.status_code, status.HTTP_200_OK)
            self.assertEqual(records.data["count"], 1)
            self.assertEqual(records.data["results"][0]["id"], future.pk)
        records_today = self.client.get("/api/appointments/", {
            "exclude_today": "true", "date": self.today.isoformat(),
        }, **headers)
        self.assertEqual(records_today.data["count"], 0)

    def test_appointment_records_search_and_pagination(self):
        headers = self.auth_headers(self.user_rec)
        future = Appointment.objects.create(
            appointment_id="appt-search", patient=self.patient, doctor=self.doctor,
            department=self.dept, appointment_date=self.today + datetime.timedelta(days=2),
            time_slot="11:00", token_number=91, status=Appointment.Status.CANCELLED,
            created_by=self.staff_rec,
        )
        url = "/api/appointments/"
        for search in [self.patient.phone, self.patient.mrn, self.patient.name, "#91"]:
            response = self.client.get(url, {"search": search, "date": future.appointment_date.isoformat()}, **headers)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data["count"], 1)
            self.assertEqual(response.data["results"][0]["id"], future.pk)
        all_records = self.client.get(url, {"page_size": 1}, **headers)
        self.assertEqual(all_records.data["count"], 2)
        self.assertIsNotNone(all_records.data["next"])
        second_page = self.client.get(url, {"page_size": 1, "page": 2}, **headers)
        self.assertEqual(len(second_page.data["results"]), 1)
        booked = self.client.get(url, {"booked_date": timezone.localdate().isoformat()}, **headers)
        self.assertIn(future.pk, [row["id"] for row in booked.data["results"]])
        today = self.client.get(url, {"date": self.today.isoformat(), "search": "#91"}, **headers)
        self.assertEqual(today.data["count"], 0)

    def test_doctor_availability_and_bill_date_filter(self):
        # Reception billing lists show paid invoices only.
        self.bill.payment_status = Bill.PaymentStatus.PAID
        self.bill.save(update_fields=["payment_status"])
        headers = self.auth_headers(self.user_rec)
        availability = self.client.get(
            f"/api/appointments/doctor-availability/?date={(self.today + datetime.timedelta(days=1)).isoformat()}", **headers
        )
        self.assertEqual(availability.status_code, status.HTTP_200_OK)
        self.assertEqual(availability.data[0]["doctorId"], self.doctor.doctor_id)
        self.assertEqual(availability.data[0]["status"], "AVAILABLE")

        bills_today = self.client.get(
            f"/api/bills/?created_date={timezone.localdate().isoformat()}", **headers
        )
        self.assertEqual(bills_today.data["count"], 1)
        bills_other_day = self.client.get(
            f"/api/bills/?created_date={(timezone.localdate() - datetime.timedelta(days=1)).isoformat()}", **headers
        )
        self.assertEqual(bills_other_day.data["count"], 0)

    def test_appointment_slot_board_and_consultation_fee(self):
        headers = self.auth_headers(self.user_rec)

        fee_url = f"/api/appointments/consultation-fee/?doctor=staff-doc-01"
        res_fee = self.client.get(fee_url, **headers)
        self.assertEqual(res_fee.status_code, status.HTTP_200_OK)
        self.assertEqual(res_fee.data["fee"], 50000)  # 50000 paise (₹500)

        quote = self.client.get(
            f"/api/appointments/booking-quote/?patient={self.patient.patient_id}&doctor=staff-doc-01",
            **headers,
        )
        self.assertEqual(quote.status_code, status.HTTP_200_OK)
        self.assertTrue(quote.data["registrationFeeDue"])
        self.assertEqual(quote.data["total"], 70000)

        board_url = f"/api/appointments/slot-board/?doctor=staff-doc-01&date={self.today.strftime('%Y-%m-%d')}"
        res_board = self.client.get(board_url, **headers)
        self.assertEqual(res_board.status_code, status.HTTP_200_OK)
        # Slot 10:00 is booked by demo appointment
        slot_10 = next((s for s in res_board.data if s["time"] == "10:00"), None)
        self.assertIsNotNone(slot_10)
        self.assertEqual(slot_10["state"], "booked")

    def test_slot_tokens_match_walkin_and_do_not_reuse_history(self):
        from cms_recepapp.services import get_slot_board, get_next_walkin_slot
        self.appointment.time_slot = "10:00"
        self.appointment.token_number = 2
        self.appointment.status = Appointment.Status.NO_SHOW
        self.appointment.save(update_fields=["time_slot", "token_number", "status"])
        now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(8, 0)))
        board = get_slot_board(self.staff_doc.pk, self.today, now=now)
        free = [slot for slot in board if slot["state"] == "free"]
        tokens = [slot["token"] for slot in free]
        self.assertNotIn(2, tokens)
        self.assertEqual(len(tokens), len(set(tokens)))
        next_slot = get_next_walkin_slot(self.staff_doc.pk, now=now)
        self.assertEqual(next_slot, free[0])
        self.appointment.status = Appointment.Status.SCHEDULED
        self.appointment.time_slot = free[0]["time"]
        self.appointment.token_number = free[0]["token"]
        self.appointment.save(update_fields=["status", "time_slot", "token_number"])
        next_slot = get_next_walkin_slot(self.staff_doc.pk, now=now)
        self.assertNotEqual(next_slot["time"], free[0]["time"])
        self.assertNotEqual(next_slot["token"], free[0]["token"])

    def test_cancelled_reservation_and_token_are_preserved(self):
        from cms_recepapp.services import get_slot_board
        self.appointment.status = Appointment.Status.CANCELLED
        self.appointment.time_slot = "10:00"
        self.appointment.token_number = 2
        self.appointment.save(update_fields=["status", "time_slot", "token_number"])
        def board_at(hour):
            now = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(hour, 0)))
            return get_slot_board(self.staff_doc.pk, self.today, now=now)
        board = board_at(8)
        replacement = next(slot for slot in board if slot["time"] == "10:00")
        self.assertEqual(replacement["state"], "booked")
        self.assertNotEqual(next(slot for slot in board if slot["time"] == "09:30")["token"], 2)
        tokens = [slot["token"] for slot in board if slot["state"] == "free"]
        self.assertEqual(len(tokens), len(set(tokens)))
        self.assertEqual(next(slot for slot in board_at(10) if slot["time"] == "10:00")["state"], "booked")
        Appointment.objects.create(
            appointment_id="appt-998", patient=self.patient, doctor=self.doctor,
            department=self.dept, appointment_date=self.today, time_slot="11:00",
            token_number=2, status=Appointment.Status.SCHEDULED, created_by=self.staff_rec,
        )
        self.assertFalse(any(slot["token"] == 2 for slot in board_at(8) if slot["state"] == "free"))
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.Status.CANCELLED)
        self.assertEqual(self.appointment.token_number, 2)

    def test_appointment_book_and_pay(self):
        url = "/api/appointments/book-and-pay/"
        headers = self.auth_headers(self.user_rec)
        future_date = (datetime.date.today() + datetime.timedelta(days=28)).strftime("%Y-%m-%d")

        payload = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "mode": "PRIOR",
            "date": future_date,
            "time": "11:00",
            "type": "New Visit",
            "reason": "General Checkup",
            "payment": {"method": "CASH", "confirmed": True},
        }

        res = self.client.post(url, payload, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["appointment"]["doctorId"], "staff-doc-01")
        self.assertEqual(res.data["bill"]["status"], "PAID")
        self.assertEqual(res.data["bill"]["totalAmount"], 70000)
        self.assertEqual(res.data["bill"]["paidAmount"], 70000)
        self.assertEqual(len(res.data["bill"]["items"]), 2)
        self.assertEqual([item["type"] for item in res.data["bill"]["items"]], ["registration", "consultation"])
        self.assertEqual(res.data["appointment"]["status"], Appointment.Status.SCHEDULED)
        self.assertIsNotNone(res.data["appointment"]["tokenNumber"])
        self.assertEqual(res.data["appointment"]["bookingMode"], "PRIOR")

    def test_repeat_booking_after_paid_registration_charges_consultation_only(self):
        reg_bill = Bill.objects.create(
            bill_id="bill-reg-01", patient=self.patient, bill_date=self.today,
            total_amount=Decimal("200.00"), amount_paid=Decimal("0.00"),
            payment_status=Bill.PaymentStatus.UNPAID, generated_by=self.staff_rec,
        )
        BillItem.objects.create(
            bill_item_id="item-reg-01", bill=reg_bill, item_type=BillItem.ItemType.REGISTRATION,
            source_id=self.patient.patient_id, description="Registration fee", amount=Decimal("200.00"),
        )
        Payment.objects.create(
            payment_id="pay-reg-01", bill=reg_bill, amount_paid=Decimal("200.00"),
            payment_date=self.today, payment_method=Payment.Method.CASH, received_by=self.staff_rec,
        )
        headers = self.auth_headers(self.user_rec)
        response = self.client.post("/api/appointments/book-and-pay/", {
            "patientId": self.patient.patient_id, "doctorId": self.staff_doc.staff_id,
            "mode": "PRIOR", "date": (self.today + datetime.timedelta(days=2)).isoformat(),
            "time": "11:00", "type": "Follow-up", "payment": {"method": "CASH", "confirmed": True},
        }, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["bill"]["totalAmount"], 50000)
        self.assertEqual(len(response.data["bill"]["items"]), 1)
        self.assertEqual(response.data["bill"]["items"][0]["type"], "consultation")

    def test_later_visit_after_completed_paid_consultation_charges_consultation_only(self):
        Payment.objects.create(
            payment_id="pay-002", bill=self.bill, amount_paid=Decimal("350.00"),
            payment_date=self.today, payment_method=Payment.Method.CASH, received_by=self.staff_rec,
        )
        self.appointment.status = Appointment.Status.COMPLETED
        self.appointment.save(update_fields=["status", "updated_at"])
        # Legacy demo bills are linked to the patient, but not directly to appointments.
        Bill.objects.filter(pk=self.bill.bill_id).update(appointment=None)
        headers = self.auth_headers(self.user_rec)
        response = self.client.post("/api/appointments/book-and-pay/", {
            "patientId": self.patient.patient_id, "doctorId": self.staff_doc.staff_id,
            "mode": "PRIOR", "date": (self.today + datetime.timedelta(days=2)).isoformat(),
            "time": "11:00", "type": "Follow-up", "payment": {"method": "CASH", "confirmed": True},
        }, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["bill"]["totalAmount"], 50000)
        self.assertEqual([item["type"] for item in response.data["bill"]["items"]], ["consultation"])

    def test_paid_walk_in_is_automatically_checked_in(self):
        self.appointment.status = Appointment.Status.CANCELLED
        self.appointment.save(update_fields=["status"])
        headers = self.auth_headers(self.user_rec)
        now = timezone.make_aware(
            datetime.datetime.combine(self.today, datetime.time(9, 0)),
            timezone.get_current_timezone(),
        )
        payload = {
            "patientId": self.patient.patient_id,
            "doctorId": self.staff_doc.staff_id,
            "mode": "WALK_IN",
            "arrivalConfirmed": True,
            "date": self.today.isoformat(),
            "time": "09:00",
            "payment": {"method": "CASH", "confirmed": True},
        }
        with patch("cms_recepapp.views.timezone.localtime", return_value=now), patch(
            "cms_recepapp.views.timezone.localdate", return_value=self.today
        ):
            response = self.client.post("/api/appointments/book-and-pay/", payload, format="json", **headers)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["appointment"]["status"], Appointment.Status.CHECKED_IN)
        self.assertEqual(response.data["appointment"]["time"], "09:00")
        self.assertEqual(response.data["appointment"]["bookingMode"], "WALK_IN")

    def test_appointment_check_in_and_cancel(self):
        headers = self.auth_headers(self.user_rec)

        # Cancel appointment
        cancel_url = f"/api/appointments/{self.appointment.appointment_id}/cancel/"
        previous_paid = self.bill.amount_paid
        previous_payment_count = self.bill.payments.count()
        res_cancel = self.client.post(cancel_url, {"reason": "Patient requested", "refund": True}, format="json", **headers)
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cancel.data["status"], "CANCELLED")

        self.bill.refresh_from_db()
        self.assertEqual(self.bill.payment_status, Bill.PaymentStatus.CANCELLED)
        self.assertEqual(self.bill.amount_paid, previous_paid)
        self.assertEqual(self.bill.payments.count(), previous_payment_count)

    def test_prior_no_show_can_be_cancelled_preserving_history(self):
        from cms_recepapp.services import get_slot_board
        self.appointment.status = Appointment.Status.NO_SHOW
        self.appointment.notes = "Marked no-show by Reception"
        self.appointment.save(update_fields=["status", "notes"])
        token = self.appointment.token_number
        response = self.client.post(
            f"/api/appointments/{self.appointment.pk}/cancel/",
            {"reason": "Patient requested cancellation"}, format="json",
            **self.auth_headers(self.user_rec),
        )
        self.assertEqual(response.status_code, 200)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.Status.CANCELLED)
        self.assertEqual(self.appointment.token_number, token)
        self.assertIn("Marked no-show by Reception", self.appointment.notes)
        self.assertIn("Patient requested cancellation", self.appointment.notes)
        slot = next(s for s in get_slot_board(self.staff_doc.pk, self.today) if s["time"] == self.appointment.time_slot)
        self.assertEqual(slot["state"], "booked")
        self.assertEqual(slot["token"], token)

    def test_walkin_no_show_cannot_be_cancelled(self):
        self.appointment.booking_mode = Appointment.BookingMode.WALK_IN
        self.appointment.status = Appointment.Status.NO_SHOW
        self.appointment.save(update_fields=["booking_mode", "status"])
        response = self.client.post(
            f"/api/appointments/{self.appointment.pk}/cancel/",
            {"reason": "Requested"}, format="json", **self.auth_headers(self.user_rec),
        )
        self.assertEqual(response.status_code, 400)

    def test_checked_in_appointment_cannot_be_cancelled(self):
        self.appointment.status = Appointment.Status.CHECKED_IN
        self.appointment.save(update_fields=["status"])
        response = self.client.post(
            f"/api/appointments/{self.appointment.pk}/cancel/",
            {"reason": "Patient requested"}, format="json",
            **self.auth_headers(self.user_rec),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.Status.CHECKED_IN)

    def test_manual_no_show_and_incompatible_check_in(self):
        headers = self.auth_headers(self.user_rec)
        url = f"/api/appointments/{self.appointment.pk}/no-show/"
        response = self.client.post(url, {}, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Appointment.Status.NO_SHOW)
        response = self.client.post(f"/api/appointments/{self.appointment.pk}/check-in/", {}, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_auto_no_show_respects_grace_and_preserves_checked_in(self):
        from cms_recepapp.services import mark_expired_scheduled_appointments
        Setting.objects.update_or_create(key="appointment.slotDuration", defaults={"value": "30"})
        self.appointment.time_slot = "10:00"
        self.appointment.save(update_fields=["time_slot"])
        def at(hour, minute):
            return timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(hour, minute)))
        for moment in [at(10, 0), at(10, 14)]:
            self.assertEqual(mark_expired_scheduled_appointments(now=moment), 0)
        self.assertEqual(mark_expired_scheduled_appointments(now=at(10, 15)), 1)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.Status.NO_SHOW)
        self.assertEqual(mark_expired_scheduled_appointments(now=at(10, 31)), 0)
        self.appointment.status = Appointment.Status.CHECKED_IN
        self.appointment.save(update_fields=["status"])
        self.assertEqual(mark_expired_scheduled_appointments(now=at(11, 0)), 0)

    def test_check_in_during_slot_is_persisted(self):
        headers = self.auth_headers(self.user_rec)
        self.appointment.time_slot = "10:00"
        self.appointment.save(update_fields=["time_slot"])
        self.settle_appointment_bill()
        moment = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(10, 10)))
        with patch("cms_recepapp.views.timezone.now", return_value=moment):
            response = self.client.post(f"/api/appointments/{self.appointment.pk}/check-in/", {}, format="json", **headers)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, Appointment.Status.CHECKED_IN)

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
        res_invalid_amount = self.client.post(url, {"amount": "not-money", "method": "CASH"}, format="json", **headers)
        self.assertEqual(res_invalid_amount.status_code, status.HTTP_400_BAD_REQUEST)
        res_invalid_method = self.client.post(url, {"amount": 1000, "method": "BITCOIN"}, format="json", **headers)
        self.assertEqual(res_invalid_method.status_code, status.HTTP_400_BAD_REQUEST)

        # Pay exact remaining balance: 35000 paise
        res_pay = self.client.post(url, {"amount": 35000, "method": "CASH"}, format="json", **headers)
        self.assertEqual(res_pay.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pay.data["paidAmount"], 85000)
        self.assertEqual(res_pay.data["balanceDue"], 0)
        self.assertEqual(res_pay.data["status"], "PAID")

    def test_payment_reconciles_bill_total_from_payment_records(self):
        bill = Bill.objects.create(
            bill_id="bill-recon-01",
            patient=self.patient,
            bill_date=self.today,
            total_amount=Decimal("500.00"),
            amount_paid=Decimal("500.00"),
            payment_status=Bill.PaymentStatus.PAID,
        )

        Payment.objects.create(
            payment_id="pay-recon-01",
            bill=bill,
            amount_paid=Decimal("500.00"),
            payment_date=self.today,
            payment_method=Payment.Method.CASH,
        )

        bill.refresh_from_db()
        self.assertEqual(bill.amount_paid, Decimal("500.00"))
        self.assertEqual(bill.payment_status, Bill.PaymentStatus.PAID)

    def test_lab_technician_can_receive_payment(self):
        # Partial lab collection uses a non-appointment bill.
        Bill.objects.filter(pk=self.bill.pk).update(appointment=None)
        url = f"/api/bills/{self.bill.bill_id}/receive-payment/"
        headers = self.auth_headers(self.user_lab)

        response = self.client.post(
            url,
            {"amount": 10000, "method": "CARD"},
            format="json",
            **headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["paidAmount"], 60000)
        self.assertEqual(response.data["balanceDue"], 25000)

    def test_lab_payment_is_limited_to_lab_charges_on_mixed_bill(self):
        bill = Bill.objects.create(
            bill_id="bill-lab-cap",
            patient=self.patient,
            bill_date=self.today,
            total_amount=Decimal("1000.00"),
            amount_paid=Decimal("0.00"),
            payment_status=Bill.PaymentStatus.UNPAID,
        )
        BillItem.objects.create(
            bill_item_id="bi-lab-cap-1",
            bill=bill,
            item_type=BillItem.ItemType.LAB_TEST,
            source_id="lab-cap",
            description="CBC Lab Test",
            amount=Decimal("350.00"),
        )
        BillItem.objects.create(
            bill_item_id="bi-lab-cap-2",
            bill=bill,
            item_type=BillItem.ItemType.CONSULTATION,
            source_id="appt-cap",
            description="Consultation Fee",
            amount=Decimal("650.00"),
        )
        url = f"/api/bills/{bill.bill_id}/receive-payment/"
        headers = self.auth_headers(self.user_lab)
        transaction_ref = f"LAB_TEST_PAYMENT:{bill.bill_id}"

        first_payment = self.client.post(
            url,
            {"amount": 30000, "method": "CASH", "transactionRef": transaction_ref},
            format="json",
            **headers,
        )
        self.assertEqual(first_payment.status_code, status.HTTP_200_OK)
        self.assertEqual(first_payment.data["balanceDue"], 70000)

        overpayment = self.client.post(
            url,
            {"amount": 5100, "method": "CASH", "transactionRef": transaction_ref},
            format="json",
            **headers,
        )
        self.assertEqual(overpayment.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(overpayment.data["detail"], "Payment amount exceeds the remaining laboratory test charges.")
        self.assertEqual(Payment.objects.filter(bill=bill).count(), 1)

    def test_appointment_double_booking_prevention(self):
        headers = self.auth_headers(self.user_rec)
        future_date = (datetime.date.today() + datetime.timedelta(days=3)).strftime("%Y-%m-%d")

        # 1. First booking succeeds
        payload1 = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "mode": "PRIOR",
            "date": future_date,
            "time": "14:00",
            "type": "Follow-up",
            "payment": {"method": "CASH", "confirmed": True},
        }
        res1 = self.client.post("/api/appointments/book-and-pay/", payload1, format="json", **headers)
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        appt_id = res1.data["appointment"]["id"]

        # 2. Second booking with exact same doctor, date, and time slot -> blocked by double-booking check
        payload2 = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "mode": "PRIOR",
            "date": future_date,
            "time": "14:00",
            "type": "New Visit",
            "payment": {"method": "CARD", "confirmed": True},
        }
        res2 = self.client.post("/api/appointments/book-and-pay/", payload2, format="json", **headers)
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res2.data.get("code"), "DUPLICATE_DOCTOR_DAY")

        # 3. Cancel the first appointment
        res_cancel = self.client.post(f"/api/appointments/{appt_id}/cancel/", {"reason": "Change of plans"}, format="json", **headers)
        self.assertEqual(res_cancel.status_code, status.HTTP_200_OK)

        # 4. Cancelled reservation cannot be reassigned
        res3 = self.client.post("/api/appointments/book-and-pay/", payload2, format="json", **headers)
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bill_cancel_with_refund_and_audit(self):
        headers = self.auth_headers(self.user_rec)
        url_cancel = f"/api/bills/{self.bill.bill_id}/cancel/"

        res = self.client.post(url_cancel, {"reason": "Patient discharged without service"}, format="json", **headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "CANCELLED")
        self.assertEqual(res.data["paidAmount"], 0)

        # Verify negative refund payment was recorded
        refund_pay = Payment.objects.filter(bill=self.bill, amount_paid=-Decimal("500.00")).first()
        self.assertIsNotNone(refund_pay)

        # Verify AuditLog created
        log = AuditLog.objects.filter(action="CANCEL_BILL", entity_id=self.bill.bill_id).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.entity_type, "BILL")

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

    def walkin_request(self, **overrides):
        payload = {
            "patientId": self.patient.pk, "doctorId": self.staff_doc.pk,
            "mode": "WALK_IN", "date": self.today.isoformat(), "time": "10:30",
            "arrivalConfirmed": True, "payment": {"method": "CASH", "confirmed": True},
        }
        payload.update(overrides)
        moment = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(10, 20)))
        # The preexisting appointment belongs to the fixture patient; use another patient.
        patient, _ = Patient.objects.get_or_create(patient_id="pat-walkin", defaults={"name": "Walk-in"})
        payload["patientId"] = patient.pk
        with patch("cms_recepapp.views.timezone.localtime", return_value=moment):
            return self.client.post("/api/appointments/book-and-pay/", payload, format="json", **self.auth_headers(self.user_rec))

    def test_walkin_excludes_started_slots_and_requires_arrival(self):
        for time in ["09:00", "09:30", "10:00"]:
            response = self.walkin_request(time=time)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "SLOT_UNAVAILABLE")
        response = self.walkin_request(arrivalConfirmed=False)
        self.assertEqual(response.data["code"], "ARRIVAL_NOT_CONFIRMED")
        response = self.walkin_request()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["appointment"]["status"], "CHECKED_IN")
        self.assertEqual(response.data["appointment"]["tokenNumber"], 4)

    def test_walkin_cannot_choose_later_free_slot(self):
        before = (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count())
        response = self.walkin_request(time="11:00")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "SLOT_UNAVAILABLE")
        self.assertEqual(before, (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count()))

    def test_walkin_uses_next_slot_after_reservation(self):
        self.appointment.time_slot = "10:30"
        self.appointment.save(update_fields=["time_slot"])
        response = self.walkin_request(time="11:00")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["appointment"]["time"], "11:00")

    def test_walkin_respects_all_prior_reservation_statuses(self):
        self.appointment.time_slot = "10:30"
        for state in ["SCHEDULED", "CANCELLED", "NO_SHOW"]:
            self.appointment.status = state
            self.appointment.save(update_fields=["status", "time_slot"])
            response = self.walkin_request()
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["code"], "SLOT_UNAVAILABLE")

    def test_payment_failure_rolls_back_booking_and_token(self):
        from rest_framework.exceptions import ValidationError
        counts = (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count())
        original_create = Payment.objects.create
        def failing_payment(**kwargs):
            original_create(**kwargs)
            raise ValidationError({"detail": "Payment failed"})
        with patch("cms_recepapp.views.Payment.objects.create", side_effect=failing_payment):
            response = self.walkin_request()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(counts, (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count()))
        response = self.walkin_request(payment={"method": "CASH", "confirmed": False})
        self.assertEqual(response.data["code"], "PAYMENT_NOT_CONFIRMED")
        self.assertEqual(counts, (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count()))

    def test_no_show_grace_is_configurable_and_only_prior(self):
        from cms_recepapp.services import mark_expired_scheduled_appointments
        Setting.objects.update_or_create(key="appointment.noShowGraceMinutes", defaults={"value": "45"})
        self.appointment.time_slot = "10:00"
        self.appointment.save(update_fields=["time_slot"])
        at = lambda minute: timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(10, minute)))
        self.assertEqual(mark_expired_scheduled_appointments(now=at(44)), 0)
        self.assertEqual(mark_expired_scheduled_appointments(now=at(45)), 1)
        self.appointment.status = "SCHEDULED"
        self.appointment.booking_mode = "WALK_IN"
        self.appointment.save(update_fields=["status", "booking_mode"])
        self.assertEqual(mark_expired_scheduled_appointments(now=at(59)), 0)

    def test_history_cannot_be_deleted_or_rescheduled_via_crud(self):
        url = f"/api/appointments/{self.appointment.pk}/"
        headers = self.auth_headers(self.user_rec)
        self.assertEqual(self.client.delete(url, **headers).status_code, 400)
        self.assertEqual(self.client.patch(url, {"time": "09:00"}, format="json", **headers).status_code, 400)
        self.assertTrue(Appointment.objects.filter(pk=self.appointment.pk).exists())


    def settle_appointment_bill(self):
        self.bill.refresh_from_db()
        balance = self.bill.total_amount - self.bill.amount_paid
        if balance > 0:
            Payment.objects.create(bill=self.bill, amount_paid=balance, payment_date=self.today,
                                   payment_method="CASH", received_by=self.staff_rec)
        self.bill.refresh_from_db()

    def prior_action(self, action, data=None, user=None):
        return self.client.post(f"/api/appointments/{self.appointment.pk}/{action}/",
                                data or {}, format="json", **self.auth_headers(user or self.user_rec))

    def test_late_arrival_restores_checks_in_and_prints_saved_token(self):
        from cms_recepapp.services import mark_expired_scheduled_appointments
        self.settle_appointment_bill()
        self.appointment.status = "NO_SHOW"
        self.appointment.notes = "Automatically marked No-show"
        self.appointment.save(update_fields=["status", "notes"])
        original = (self.appointment.pk, self.appointment.token_number, self.appointment.time_slot)
        counts = (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count())
        response = self.prior_action("undo-no-show", {"arrivalConfirmed": True})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "SCHEDULED")
        noon = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(12)))
        with patch("django.utils.timezone.now", return_value=noon):
            self.assertEqual(mark_expired_scheduled_appointments(), 0)
            self.assertEqual(self.prior_action("print-token").status_code, 400)
            checked_in = self.prior_action("check-in")
            self.assertEqual(checked_in.status_code, 200, checked_in.data)
            for _ in range(2):
                printed = self.prior_action("print-token")
                self.assertEqual(printed.status_code, 200, printed.data)
                self.assertEqual(printed.data["tokenNumber"], original[1])
        self.appointment.refresh_from_db()
        self.assertEqual((self.appointment.pk, self.appointment.token_number, self.appointment.time_slot), original)
        self.assertIn("Automatically marked No-show", self.appointment.notes)
        self.assertIn("late arrival confirmed", self.appointment.notes)
        self.assertEqual(counts, (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count()))
        self.assertEqual(AuditLog.objects.filter(action="UNDO_NO_SHOW_APPOINTMENT", entity_id=self.appointment.pk).count(), 1)
        self.assertEqual(self.prior_action("undo-no-show", {"arrivalConfirmed": True}).status_code, 400)

    def test_prior_print_and_undo_enforce_date_and_state(self):
        self.settle_appointment_bill()
        for action, state in [("print-token", "CHECKED_IN"), ("undo-no-show", "NO_SHOW")]:
            for offset in [-1, 1, 28]:
                self.appointment.status = state
                self.appointment.appointment_date = self.today + datetime.timedelta(days=offset)
                self.appointment.save(update_fields=["status", "appointment_date"])
                response = self.prior_action(action, {"arrivalConfirmed": True})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "INVALID_APPOINTMENT_DATE")
        self.appointment.appointment_date = self.today
        for state in ["SCHEDULED", "NO_SHOW", "CANCELLED", "IN_PROGRESS", "COMPLETED"]:
            self.appointment.status = state
            self.appointment.save(update_fields=["status", "appointment_date"])
            self.assertEqual(self.prior_action("print-token").status_code, 400)
        self.appointment.status = "CANCELLED"
        self.appointment.save(update_fields=["status"])
        self.assertEqual(self.prior_action("undo-no-show", {"arrivalConfirmed": True}).status_code, 400)

    def test_prior_actions_require_payment_token_and_arrival(self):
        self.appointment.status = "NO_SHOW"
        self.appointment.save(update_fields=["status"])
        self.assertEqual(self.prior_action("undo-no-show").data["code"], "ARRIVAL_NOT_CONFIRMED")
        for action, state in [("print-token", "CHECKED_IN"), ("undo-no-show", "NO_SHOW"), ("check-in", "SCHEDULED")]:
            self.appointment.status = state
            self.appointment.save(update_fields=["status"])
            for payment_status in ["UNPAID", "PARTIAL", "CANCELLED"]:
                self.bill.payment_status = payment_status
                self.bill.save(update_fields=["payment_status"])
                response = self.prior_action(action, {"arrivalConfirmed": True})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "PAYMENT_REQUIRED")
        self.settle_appointment_bill()
        self.appointment.token_number = None
        self.appointment.status = "NO_SHOW"
        self.appointment.save(update_fields=["token_number", "status"])
        self.assertEqual(self.prior_action("undo-no-show", {"arrivalConfirmed": True}).data["code"], "TOKEN_REQUIRED")
        self.appointment.status = "CHECKED_IN"
        self.appointment.save(update_fields=["status"])
        self.assertEqual(self.prior_action("print-token").data["code"], "TOKEN_REQUIRED")

    def test_new_prior_actions_reject_walkins_and_doctor_role(self):
        self.settle_appointment_bill()
        self.appointment.booking_mode = "WALK_IN"
        for action, state in [("print-token", "CHECKED_IN"), ("undo-no-show", "NO_SHOW")]:
            self.appointment.status = state
            self.appointment.save(update_fields=["booking_mode", "status"])
            self.assertEqual(self.prior_action(action, {"arrivalConfirmed": True}).status_code, 400)
            self.assertEqual(self.prior_action(action, {"arrivalConfirmed": True}, user=self.user_doc).status_code, 403)

    def test_undo_rejects_legacy_active_conflicts(self):
        self.settle_appointment_bill()
        self.appointment.status = "NO_SHOW"
        self.appointment.save(update_fields=["status"])
        other = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
            appointment_date=self.today, time_slot="11:00", token_number=self.appointment.token_number,
            status="CHECKED_IN")
        response = self.prior_action("undo-no-show", {"arrivalConfirmed": True})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "APPOINTMENT_CONFLICT")
        other.token_number = 99
        other.time_slot = self.appointment.time_slot
        other.save(update_fields=["token_number", "time_slot"])
        self.assertEqual(self.prior_action("undo-no-show", {"arrivalConfirmed": True}).data["code"], "APPOINTMENT_CONFLICT")

    def test_undo_exemption_does_not_disable_other_or_next_day_no_shows(self):
        from cms_recepapp.services import mark_expired_scheduled_appointments
        self.settle_appointment_bill()
        self.appointment.status = "NO_SHOW"
        self.appointment.save(update_fields=["status"])
        self.assertEqual(self.prior_action("undo-no-show", {"arrivalConfirmed": True}).status_code, 200)
        other = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
            appointment_date=self.today, time_slot="11:00", token_number=5, status="SCHEDULED")
        noon = timezone.make_aware(datetime.datetime.combine(self.today, datetime.time(12)))
        self.assertEqual(mark_expired_scheduled_appointments(now=noon), 1)
        other.refresh_from_db()
        self.assertEqual(other.status, "NO_SHOW")
        self.assertEqual(mark_expired_scheduled_appointments(now=noon + datetime.timedelta(days=1)), 1)


    def test_patient_name_examples_on_registration_and_edit(self):
        headers = self.auth_headers(self.user_rec)
        payload = {"phone": "9876543210", "dateOfBirth": "1990-01-01", "gender": "Others", "address": "Clinic Road", "confirmPossibleDuplicate": True}
        original_mrn = self.patient.mrn
        original_links = (self.appointment.patient_id, self.bill.patient_id, Payment.objects.count())
        for name in ["Kirti", "Kirti K", "K Kirti", "Uma D K", "K S Kirti", "Mary Jane"]:
            payload["name"] = name
            created = self.client.post("/api/patients/", payload, format="json", **headers)
            self.assertEqual(created.status_code, 201, created.data)
            self.assertEqual(created.data["gender"], "Others")
            edited = self.client.patch(f"/api/patients/{self.patient.pk}/", payload, format="json", **headers)
            self.assertEqual(edited.status_code, 200, edited.data)
            self.assertEqual(edited.data["name"], name)
        self.patient.refresh_from_db()
        self.appointment.refresh_from_db()
        self.bill.refresh_from_db()
        self.assertEqual(self.patient.mrn, original_mrn)
        self.assertEqual((self.appointment.patient_id, self.bill.patient_id, Payment.objects.count()), original_links)

    def test_patient_invalid_fields_rejected_by_registration_and_edit_apis(self):
        headers = self.auth_headers(self.user_rec)
        base = {"name": "Kirti K", "phone": "9876543210", "dateOfBirth": "1990-01-01", "gender": "Female", "address": "Clinic Road", "confirmPossibleDuplicate": True}
        invalid = {
            "name": ["K L S", "Jo", "Kirti123", "Kirti@", "Kirti  K", " Kirti", "Kirti ", "", "Kirti-K", "Kirti.K", "Kirti\tK"],
            "phone": ["5123456789", "98765", "98765432101", "98765abc10", "98765 3210", " 9876543210", "9876543210 ", 9876543210],
            "dateOfBirth": ["1899-12-31", (self.today + datetime.timedelta(days=1)).isoformat(), "2000-02-30", "2000-02", "", None],
            "gender": ["Invalid", "", None, {"gender": "Female"}],
            "bloodGroup": ["X+", "AB", "A++"],
            "allergies": ["   ", {"name": "Peanuts"}, 123, ["Peanuts", 12], [" "], "Peanuts,,Milk"],
        }
        before = Patient.objects.count()
        original = Patient.objects.values().get(pk=self.patient.pk)
        for field, values in invalid.items():
            for value in values:
                payload = {**base, field: value}
                for method, url in [("post", "/api/patients/"), ("post", "/api/patients/precheck/"), ("patch", f"/api/patients/{self.patient.pk}/"), ("put", f"/api/patients/{self.patient.pk}/")]:
                    with self.subTest(field=field, value=value, method=method, url=url):
                        response = getattr(self.client, method)(url, payload, format="json", **headers)
                        self.assertEqual(response.status_code, 400, response.data)
                        self.assertIn(field, response.data)
        self.assertEqual(Patient.objects.count(), before)
        self.assertEqual(Patient.objects.values().get(pk=self.patient.pk), original)

    def test_patient_optional_allergies_blood_group_and_partial_updates(self):
        headers = self.auth_headers(self.user_rec)
        for allergy in ["", None, [], "Penicillin (rash); severe / immediate", ["Peanuts", "Dust mites (mild)"]]:
            response = self.client.patch(f"/api/patients/{self.patient.pk}/", {"allergies": allergy, "bloodGroup": ""}, format="json", **headers)
            self.assertEqual(response.status_code, 200, response.data)
        self.patient.refresh_from_db()
        previous_allergies = self.patient.allergies
        response = self.client.patch(f"/api/patients/{self.patient.pk}/", {"address": "Updated Clinic Road"}, format="json", **headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.allergies, previous_allergies)


class ConcurrentReceptionBookingTests(TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_same_slot_concurrent_requests_only_issue_one_paid_token(self):
        role = Role.objects.create(role_id="RECEPTIONIST", role_name="Receptionist")
        doctor_role = Role.objects.create(role_id="DOCTOR", role_name="Doctor")
        department = Department.objects.create(department_id="dept-race", name="Race clinic")
        staff = Staff.objects.create(staff_id="staff-race", name="Reception", email="rec@race.test", role=role)
        user = User.objects.create(user_id="user-race", username="race", staff=staff, role=role, is_active=True)
        doctor_staff = Staff.objects.create(staff_id="docstaff-race", name="Doctor", email="doc@race.test", role=doctor_role, department=department)
        doctor = Doctor.objects.create(doctor_id="doc-race", staff=doctor_staff, department=department, consultation_fee=Decimal("500"))
        patients = [Patient.objects.create(patient_id=f"race-pat-{i}", name=f"Patient {i}") for i in range(2)]
        tomorrow = (timezone.localdate() + datetime.timedelta(days=1)).isoformat()
        barrier = Barrier(2)
        def book(patient_id):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=user)
                barrier.wait(timeout=10)
                return client.post("/api/appointments/book-and-pay/", {
                    "patientId": patient_id, "doctorId": doctor.pk,
                    "mode": "PRIOR", "date": tomorrow, "time": "10:30",
                    "payment": {"method": "CASH", "confirmed": True},
                }, format="json").status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(book, [p.pk for p in patients]))
        self.assertEqual(sorted(outcomes), [201, 400])
        self.assertEqual(Appointment.objects.count(), 1)
        self.assertEqual(Payment.objects.count(), 1)
        appointment = Appointment.objects.get()
        self.assertEqual(appointment.token_number, 4)
        self.assertEqual(appointment.status, "SCHEDULED")

    def race_late_arrival_actions(self, second_action):
        # Use committed fixtures so separate MySQL connections exercise real locks.
        ReceptionGroupTests.setUp(self)
        ReceptionGroupTests.settle_appointment_bill(self)
        self.appointment.status = "NO_SHOW"
        self.appointment.save(update_fields=["status"])
        counts = (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count())
        token = self.appointment.token_number
        barrier = Barrier(2)
        def perform(action):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=self.user_rec)
                barrier.wait(timeout=10)
                result = client.post(f"/api/appointments/{self.appointment.pk}/{action}/",
                    {"arrivalConfirmed": True, "reason": "Patient requested cancellation"}, format="json")
                return action, result.status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = dict(pool.map(perform, ["undo-no-show", second_action]))
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.token_number, token)
        self.assertEqual(counts, (Appointment.objects.count(), Bill.objects.count(), Payment.objects.count()))
        return outcomes

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_undo_and_cancel_preserve_cancellation(self):
        outcomes = self.race_late_arrival_actions("cancel")
        self.assertEqual(outcomes["cancel"], 200)
        self.assertIn(outcomes["undo-no-show"], [200, 400])
        self.assertEqual(self.appointment.status, "CANCELLED")

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_undo_and_checkin_preserve_valid_state(self):
        outcomes = self.race_late_arrival_actions("check-in")
        self.assertEqual(outcomes["undo-no-show"], 200)
        self.assertIn(outcomes["check-in"], [200, 400])
        self.assertEqual(self.appointment.status, "CHECKED_IN" if outcomes["check-in"] == 200 else "SCHEDULED")
