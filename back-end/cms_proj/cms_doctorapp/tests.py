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
from unittest.mock import patch
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from cms_backendapp.models import Role, Staff, User, Department, LabTestCatalog, Notification
from cms_recepapp.models import Patient, Appointment, Bill, BillItem
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
        self.appointment.status = Appointment.Status.CHECKED_IN
        self.appointment.save(update_fields=["status"])

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

    def test_consultation_requires_check_in(self):
        response = self.client.post(
            "/api/consultations/get-or-create/",
            {"appointmentId": self.appointment.appointment_id},
            format="json",
            **self.auth_headers(self.user_doc),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get("code"), "INVALID_APPOINTMENT_STATE")
        self.assertFalse(ConsultationRecord.objects.filter(appointment=self.appointment).exists())

    def test_prescription_allergy_check_and_dispense(self):
        headers_doc = self.auth_headers(self.user_doc)

        # 1. Prescribe Amoxicillin to patient allergic to Penicillin -> blocked with ALLERGY_ALERT
        bad_payload = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "items": [{"medicineId": "med-01", "durationDays": 5}],
        }
        res_bad = self.client.post("/api/prescriptions/", bad_payload, format="json", **headers_doc)
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_bad.data.get("code"), "ALLERGY_ALERT")

        # 2. Explicit override -> succeeds
        bad_payload["explicitOverride"] = True
        res_override = self.client.post("/api/prescriptions/", bad_payload, format="json", **headers_doc)
        self.assertEqual(res_override.status_code, status.HTTP_201_CREATED)
        rx_id = res_override.data["id"]

        # Doctors cannot dispense; the pharmacist must explicitly supply final quantities.
        doctor_dispense = self.client.post(
            f"/api/prescriptions/{rx_id}/dispense/",
            {"items": [{"itemId": res_override.data["items"][0]["id"], "quantity": 10}]},
            format="json",
            **headers_doc,
        )
        self.assertEqual(doctor_dispense.status_code, status.HTTP_403_FORBIDDEN)

        # Pharmacist dispenses prescription
        headers_pharm = self.auth_headers(self.user_pharm)
        dispense_payload = {
            "items": [{"itemId": res_override.data["items"][0]["id"], "quantity": 10}],
            "payment": {"status": "PAID", "method": "CASH"},
        }
        res_disp = self.client.post(f"/api/prescriptions/{rx_id}/dispense/", dispense_payload, format="json", **headers_pharm)
        self.assertEqual(res_disp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_disp.data["status"], "DISPENSED")

        pharmacy_bill_item = BillItem.objects.get(
            source_id=rx_id,
            item_type=BillItem.ItemType.PHARMACY,
        )
        pharmacy_bill = pharmacy_bill_item.bill
        self.assertEqual(pharmacy_bill.total_amount, pharmacy_bill_item.amount)
        self.assertEqual(pharmacy_bill.amount_paid, pharmacy_bill.total_amount)

        # Verify stock decremented
        self.med_amox.refresh_from_db()
        self.assertEqual(self.med_amox.stock_quantity, 90)

        # Verify stock ledger entry created
        ledger = StockLedgerEntry.objects.filter(medicine=self.med_amox, entry_type="DISPENSE").first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.quantity, -10)

    def test_direct_prescription_creation_without_consultation(self):
        headers_doc = self.auth_headers(self.user_doc)
        payload = {
            "patientId": self.patient.patient_id,
            "items": [{
                "medicineId": self.med_para.medicine_id,
                "dosage": "1 tablet",
                "frequency": "Twice daily",
                "durationDays": 6,
                "instructions": "After food",
            }],
        }

        missing_duration = {**payload, "items": [{"medicineId": self.med_para.medicine_id}]}
        invalid_response = self.client.post("/api/prescriptions/", missing_duration, format="json", **headers_doc)
        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_response.data.get("code"), "VALIDATION_ERROR")

        doctor_quantity = {**payload, "items": [{**payload["items"][0], "quantity": 12}]}
        quantity_response = self.client.post("/api/prescriptions/", doctor_quantity, format="json", **headers_doc)
        self.assertEqual(quantity_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(quantity_response.data.get("code"), "PHARMACIST_QUANTITY_REQUIRED")

        other_patient = Patient.objects.create(
            patient_id="pat-other", mrn="CLN-OTHER-0001", name="Other Doctor Patient",
            dob=datetime.date(1988, 2, 4), gender="F", phone="9847000002", is_active=True,
        )
        unauthorized_patient = self.client.post(
            "/api/prescriptions/", {**payload, "patientId": other_patient.patient_id}, format="json", **headers_doc
        )
        self.assertEqual(unauthorized_patient.status_code, status.HTTP_404_NOT_FOUND)

        another_assigned_patient = Patient.objects.create(
            patient_id="pat-assigned", mrn="CLN-ASSIGNED-0001", name="Assigned Patient",
            dob=datetime.date(1992, 8, 9), gender="M", phone="9847000003",
            assigned_doctor=self.doctor, is_active=True,
        )
        consultation = ConsultationRecord.objects.create(
            record_id="con-rx-test", patient=self.patient, doctor=self.doctor,
            appointment=self.appointment, visit_date=timezone.localdate(), is_completed=False,
        )
        mismatched_consultation = self.client.post(
            "/api/prescriptions/",
            {**payload, "patientId": another_assigned_patient.patient_id, "consultationId": consultation.record_id},
            format="json",
            **headers_doc,
        )
        self.assertEqual(mismatched_consultation.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mismatched_consultation.data.get("code"), "CONSULTATION_MISMATCH")

        response = self.client.post("/api/prescriptions/", payload, format="json", **headers_doc)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        prescription = Prescription.objects.get(pk=response.data["id"])
        self.assertEqual(prescription.patient, self.patient)
        self.assertEqual(prescription.doctor, self.doctor)
        self.assertIsNone(prescription.consultation)
        self.assertIsNone(prescription.appointment)
        self.assertEqual(prescription.items.get().duration_days, 6)
        self.assertEqual(response.data["items"][0]["quantity"], None)

        pharmacy_list = self.client.get(
            f"/api/prescriptions/?status=PENDING&patient={self.patient.patient_id}",
            **self.auth_headers(self.user_pharm),
        )
        self.assertEqual(pharmacy_list.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["id"] == prescription.prescription_id for item in pharmacy_list.data["results"]))

    def test_prescription_partial_dispense(self):
        headers_doc = self.auth_headers(self.user_doc)
        headers_pharm = self.auth_headers(self.user_pharm)

        # Duplicate medicine lines are checked together before any inventory update.
        payload = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "items": [
                {"medicineId": "med-02", "durationDays": 5},
                {"medicineId": "med-02", "durationDays": 5},
            ],
        }
        res_rx = self.client.post("/api/prescriptions/", payload, format="json", **headers_doc)
        self.assertEqual(res_rx.status_code, status.HTTP_201_CREATED)
        rx_id = res_rx.data["id"]

        # Pharmacist must supply a quantity for each line.
        missing_quantity = self.client.post(
            f"/api/prescriptions/{rx_id}/dispense/", {}, format="json", **headers_pharm
        )
        self.assertEqual(missing_quantity.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(missing_quantity.data.get("code"), "VALIDATION_ERROR")

        # Each line is individually within stock, but their combined quantity is not.
        item_ids = [item["id"] for item in res_rx.data["items"]]
        res_disp = self.client.post(
            f"/api/prescriptions/{rx_id}/dispense/",
            {"items": [{"itemId": item_ids[0], "quantity": 30}, {"itemId": item_ids[1], "quantity": 30}]},
            format="json",
            **headers_pharm,
        )
        self.assertEqual(res_disp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res_disp.data.get("code"), "INSUFFICIENT_STOCK")

        # Verify stock decremented to 0
        self.med_para.refresh_from_db()
        self.assertEqual(self.med_para.stock_quantity, 50)

    def test_reception_to_doctor_to_pharmacy_workflow(self):
        clinic_today = timezone.localdate()
        now = timezone.make_aware(datetime.datetime.combine(clinic_today, datetime.time(8, 0)))
        receptionist = Staff.objects.create(
            staff_id="staff-rec-e2e", name="Receptionist E2E", email="reception.e2e@clinova.test",
            role=self.role_rec, is_active=True,
        )
        user_rec = User.objects.create(
            user_id="user-rec-e2e", username="reception-e2e", role=self.role_rec,
            staff=receptionist, is_active=True,
        )
        user_rec.set_password("Pass@123")
        user_rec.save()
        patient = Patient.objects.create(
            patient_id="pat-e2e", mrn="CLN-E2E-0001", name="Workflow Test Patient",
            dob=datetime.date(1990, 4, 3), gender="F", phone="9847000099",
            assigned_doctor=self.doctor, is_active=True,
        )
        medicine = Medicine.objects.create(
            medicine_id="med-e2e", name="Workflow Test Medicine", generic_name="Workflow compound",
            selling_price=Decimal("3.00"), stock_quantity=40,
            batches=[{"batchNo": "E2E-1", "quantity": 40, "expiryDate": "2030-12-31"}],
        )

        receptionist_headers = self.auth_headers(user_rec)
        with patch("cms_recepapp.views.timezone.localtime", return_value=now), patch(
            "cms_recepapp.views.timezone.localdate", return_value=clinic_today
        ):
            slot_response = self.client.get(
                "/api/appointments/next-walkin-slot/?doctor=staff-doc-01", **receptionist_headers
            )
            self.assertEqual(slot_response.status_code, status.HTTP_200_OK)
            booking_response = self.client.post(
                "/api/appointments/book-and-pay/",
                {
                    "patientId": patient.patient_id,
                    "doctorId": self.staff_doc.staff_id,
                    "mode": "WALK_IN",
                    "date": clinic_today.isoformat(),
                    "time": slot_response.data["time"],
                    "type": "New Visit",
                    "arrivalConfirmed": True,
                    "payment": {"method": "CASH", "confirmed": True},
                },
                format="json",
                **receptionist_headers,
            )
        self.assertEqual(booking_response.status_code, status.HTTP_201_CREATED)
        appt_id = booking_response.data["appointment"]["id"]
        appointment = Appointment.objects.get(pk=appt_id)
        self.assertEqual(appointment.patient, patient)
        self.assertEqual(appointment.doctor, self.doctor)
        self.assertEqual(appointment.appointment_date, clinic_today)
        self.assertEqual(appointment.time_slot, slot_response.data["time"])
        self.assertEqual(appointment.status, Appointment.Status.CHECKED_IN)

        doctor_headers = self.auth_headers(self.user_doc)
        doctor_list = self.client.get(
            f"/api/appointments/?doctor=me&date={clinic_today.isoformat()}", **doctor_headers
        )
        self.assertEqual(doctor_list.status_code, status.HTTP_200_OK)
        visible_appointment = next(row for row in doctor_list.data["results"] if row["id"] == appt_id)
        self.assertEqual(visible_appointment["patient"]["id"], patient.patient_id)
        self.assertEqual(visible_appointment["patient"]["name"], patient.name)
        self.assertEqual(visible_appointment["date"], clinic_today.isoformat())
        self.assertEqual(visible_appointment["time"], appointment.time_slot)
        self.assertEqual(visible_appointment["status"], Appointment.Status.CHECKED_IN)

        other_staff = Staff.objects.create(
            staff_id="staff-doc-e2e", name="Other Doctor", email="doctor.e2e@clinova.test",
            role=self.role_doc, department=self.dept, is_active=True,
        )
        other_doctor = Doctor.objects.create(doctor_id="doc-e2e", staff=other_staff, department=self.dept)
        other_user = User.objects.create(
            user_id="user-doc-e2e", username="other-doctor-e2e", role=self.role_doc,
            staff=other_staff, is_active=True,
        )
        other_user.set_password("Pass@123")
        other_user.save()
        other_appointment = Appointment.objects.create(
            appointment_id="appt-e2e-other", patient=patient, doctor=other_doctor, department=self.dept,
            appointment_date=clinic_today, time_slot="14:00", status=Appointment.Status.SCHEDULED,
        )
        unauthorized_read = self.client.get(
            f"/api/appointments/{other_appointment.pk}/", **self.auth_headers(self.user_doc)
        )
        self.assertEqual(unauthorized_read.status_code, status.HTTP_404_NOT_FOUND)

        start_response = self.client.post(
            "/api/consultations/get-or-create/", {"appointmentId": appt_id}, format="json", **doctor_headers
        )
        self.assertEqual(start_response.status_code, status.HTTP_201_CREATED)
        consultation_id = start_response.data["id"]
        repeated_start = self.client.post(
            "/api/consultations/get-or-create/", {"appointmentId": appt_id}, format="json", **doctor_headers
        )
        self.assertEqual(repeated_start.status_code, status.HTTP_200_OK)
        self.assertEqual(repeated_start.data["id"], consultation_id)
        save_response = self.client.patch(
            f"/api/consultations/{consultation_id}/save-draft/",
            {"symptoms": "Headache", "diagnosis": "Tension headache", "notes": "Hydration advised."},
            format="json",
            **doctor_headers,
        )
        self.assertEqual(save_response.status_code, status.HTTP_200_OK)
        consultation = ConsultationRecord.objects.get(pk=consultation_id)
        self.assertEqual(consultation.patient, patient)
        self.assertEqual(consultation.doctor, self.doctor)
        self.assertEqual(consultation.appointment, appointment)
        self.assertEqual(consultation.diagnosis, "Tension headache")

        prescription_response = self.client.post(
            "/api/prescriptions/",
            {
                "patientId": patient.patient_id,
                "doctorId": self.staff_doc.staff_id,
                "consultationId": consultation_id,
                "items": [{
                    "medicineId": medicine.medicine_id,
                    "dosage": "1 tablet",
                    "frequency": "Twice daily",
                    "durationDays": 5,
                    "instructions": "After food",
                }],
            },
            format="json",
            **doctor_headers,
        )
        self.assertEqual(prescription_response.status_code, status.HTTP_201_CREATED)
        prescription_id = prescription_response.data["id"]
        prescription_item = prescription_response.data["items"][0]
        self.assertEqual(prescription_item["durationDays"], 5)
        self.assertIsNone(prescription_item["quantity"])
        self.assertEqual(Prescription.objects.get(pk=prescription_id).consultation, consultation)

        pharmacist_headers = self.auth_headers(self.user_pharm)
        pharmacy_queue = self.client.get(
            "/api/prescriptions/?status=PENDING", **pharmacist_headers
        )
        self.assertEqual(pharmacy_queue.status_code, status.HTTP_200_OK)
        self.assertTrue(any(row["id"] == prescription_id for row in pharmacy_queue.data["results"]))
        dispense_response = self.client.post(
            f"/api/prescriptions/{prescription_id}/dispense/",
            {"items": [{"itemId": prescription_item["id"], "quantity": 7}], "payment": {"status": "PAID", "method": "CASH"}},
            format="json",
            **pharmacist_headers,
        )
        self.assertEqual(dispense_response.status_code, status.HTTP_200_OK)
        self.assertEqual(dispense_response.data["status"], Prescription.Status.DISPENSED)
        self.assertEqual(dispense_response.data["items"][0]["quantity"], 7)
        self.assertEqual(dispense_response.data["items"][0]["durationDays"], 5)
        prescription = Prescription.objects.get(pk=prescription_id)
        self.assertEqual(prescription.dispensed_by, self.staff_pharm)
        self.assertEqual(prescription.items.get().quantity, 7)
        doctor_prescriptions = self.client.get(
            "/api/prescriptions/?doctor=me&status=DISPENSED", **doctor_headers
        )
        self.assertEqual(doctor_prescriptions.status_code, status.HTTP_200_OK)
        self.assertTrue(any(row["id"] == prescription_id for row in doctor_prescriptions.data["results"]))
        medicine.refresh_from_db()
        self.assertEqual(medicine.stock_quantity, 33)
        self.assertTrue(StockLedgerEntry.objects.filter(
            medicine=medicine, reference_id=prescription_id, entry_type="DISPENSE", quantity=-7
        ).exists())

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
        self.assertEqual(res_order.data["testId"], self.catalog.test_catalog_id)

        bill_item = BillItem.objects.get(source_id=order_id, item_type=BillItem.ItemType.LAB_TEST)
        bill = bill_item.bill
        self.assertEqual(bill.patient, self.patient)
        self.assertEqual(bill.total_amount, self.catalog.price)
        self.assertEqual(bill_item.amount, self.catalog.price)
        self.assertEqual(bill.total_amount, sum(item.amount for item in bill.items.all()))
        bills_response = self.client.get("/api/bills/?patient=pat-01", **headers_lab)
        self.assertEqual(bills_response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(
            item["sourceId"] == order_id
            for result in bills_response.data["results"]
            for item in result["items"]
        ))
        payment_response = self.client.post(
            f"/api/bills/{bill.bill_id}/receive-payment/",
            {"amount": 40000, "method": "UPI"},
            format="json",
            **headers_lab,
        )
        self.assertEqual(payment_response.status_code, status.HTTP_200_OK)
        self.assertEqual(payment_response.data["status"], Bill.PaymentStatus.PAID)
        self.assertEqual(payment_response.data["totalAmount"], payment_response.data["paidAmount"])
        self.assertEqual(payment_response.data["balanceDue"], 0)

        lab_notification = Notification.objects.filter(
            target_role="LAB_TECH",
            notification_type="LAB_ORDER",
        ).first()
        self.assertIsNotNone(lab_notification)
        self.assertIn(self.patient.name, lab_notification.message)
        lab_notifications_response = self.client.get("/api/notifications/", **headers_lab)
        self.assertEqual(lab_notifications_response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(
            notification["id"] == lab_notification.notification_id
            for notification in lab_notifications_response.data["results"]
        ))

        # 2. Lab Tech updates status to SAMPLE_COLLECTED
        res_stat = self.client.post(f"/api/lab-orders/{order_id}/update-status/", {"status": "SAMPLE_COLLECTED"}, format="json", **headers_lab)
        self.assertEqual(res_stat.status_code, status.HTTP_200_OK)
        self.assertEqual(res_stat.data["status"], "SAMPLE_COLLECTED")

        res_process = self.client.post(f"/api/lab-orders/{order_id}/update-status/", {"status": "PROCESSING"}, format="json", **headers_lab)
        self.assertEqual(res_process.status_code, status.HTTP_200_OK)
        self.assertEqual(res_process.data["status"], "PROCESSING")

        # Completion is only allowed when a result is saved.
        res_skip_result = self.client.post(f"/api/lab-orders/{order_id}/update-status/", {"status": "COMPLETED"}, format="json", **headers_lab)
        self.assertEqual(res_skip_result.status_code, status.HTTP_400_BAD_REQUEST)

        invalid_result = self.client.post(
            f"/api/lab-orders/{order_id}/enter-result/",
            {"results": {"Sodium": "not-a-number", "Potassium": "4.2"}},
            format="json",
            **headers_lab,
        )
        self.assertEqual(invalid_result.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_result.data["code"], "VALIDATION_ERROR")
        self.assertEqual(LabTest.objects.get(test_id=order_id).status, LabTest.Status.PROCESSING)

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
        self.assertTrue(res_res.data["notificationSent"])
        self.assertEqual(res_res.data["notificationRecipient"], self.staff_doc.name)
        stored_result = LabTestResult.objects.get(test_id=order_id)
        self.assertEqual(stored_result.results[0]["parameter"], "Sodium")
        self.assertEqual(stored_result.results[0]["flag"], "critical_low")

        # Verify critical notification to doctor
        notif = Notification.objects.filter(
            target_user=self.user_doc,
            target_role__isnull=True,
            notification_type="LAB_RESULT",
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn("critical", notif.message.lower())
        self.assertIn(self.patient.name, notif.message)
        self.assertIn(self.patient.mrn, notif.message)
        self.assertIn(order_id, notif.message)
        self.assertIn("Sodium: 125", notif.message)
        self.assertIn(self.staff_doc.name, notif.message)
        self.assertIn("Sent to prescribing doctor", notif.message)
        self.assertEqual(notif.target_user, self.user_doc)
        self.assertEqual(notif.link, "/doctor/lab-orders")
        doctor_notifications_response = self.client.get("/api/notifications/", **headers_doc)
        self.assertEqual(doctor_notifications_response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(
            notification["id"] == notif.notification_id
            for notification in doctor_notifications_response.data["results"]
        ))
        tech_notification = Notification.objects.get(
            target_user=self.user_lab,
            notification_type="LAB_RESULT_SENT",
        )
        self.assertIn("was sent to prescribing doctor", tech_notification.message)
        self.assertIn(self.staff_doc.name, tech_notification.message)
        lab_notifications_response = self.client.get("/api/notifications/", **headers_lab)
        self.assertEqual(lab_notifications_response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(
            notification["id"] == tech_notification.notification_id
            for notification in lab_notifications_response.data["results"]
        ))

    def test_lab_status_transition_and_result_permissions(self):
        order = LabTest.objects.create(
            test_id="lab-trans-01",
            patient=self.patient,
            doctor=self.doctor,
            test_catalog=self.catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.ORDERED,
        )
        headers_lab = self.auth_headers(self.user_lab)
        headers_doc = self.auth_headers(self.user_doc)

        direct_processing = self.client.post(
            f"/api/lab-orders/{order.test_id}/update-status/",
            {"status": "PROCESSING"},
            format="json",
            **headers_lab,
        )
        self.assertEqual(direct_processing.status_code, status.HTTP_400_BAD_REQUEST)

        doctor_update = self.client.post(
            f"/api/lab-orders/{order.test_id}/update-status/",
            {"status": "SAMPLE_COLLECTED"},
            format="json",
            **headers_doc,
        )
        self.assertEqual(doctor_update.status_code, status.HTTP_403_FORBIDDEN)

        result_before_collection = self.client.post(
            f"/api/lab-orders/{order.test_id}/enter-result/",
            {"results": {"Sodium": "140", "Potassium": "4.0"}},
            format="json",
            **headers_lab,
        )
        self.assertEqual(result_before_collection.status_code, status.HTTP_400_BAD_REQUEST)

    def test_doctor_lab_results_are_scoped_to_their_orders(self):
        other_staff = Staff.objects.create(
            staff_id="staff-doc-02",
            name="Dr. Other",
            email="other.doc@clinova.test",
            role=self.role_doc,
            department=self.dept,
            is_active=True,
        )
        other_doctor = Doctor.objects.create(
            doctor_id="doc-02",
            staff=other_staff,
            department=self.dept,
            consultation_fee=Decimal("500.00"),
        )
        own_order = LabTest.objects.create(
            test_id="lab-own-01",
            patient=self.patient,
            doctor=self.doctor,
            test_catalog=self.catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.COMPLETED,
        )
        other_order = LabTest.objects.create(
            test_id="lab-other-01",
            patient=self.patient,
            doctor=other_doctor,
            test_catalog=self.catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.COMPLETED,
        )
        LabTestResult.objects.create(
            result_id="labr-own-01",
            test=own_order,
            performed_by=self.staff_lab,
            result_date=datetime.date.today(),
            results={"Sodium": "140", "Potassium": "4.0"},
        )
        LabTestResult.objects.create(
            result_id="labr-other-01",
            test=other_order,
            performed_by=self.staff_lab,
            result_date=datetime.date.today(),
            results={"Sodium": "140", "Potassium": "4.0"},
        )

        response = self.client.get("/api/lab-results/", **self.auth_headers(self.user_doc))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data["results"]], ["labr-own-01"])

    def test_doctor_permissions(self):
        # Pharmacist attempting to start consultation -> 403 Forbidden
        headers_pharm = self.auth_headers(self.user_pharm)
        res_con = self.client.post("/api/consultations/get-or-create/", {"appointmentId": "appt-001"}, format="json", **headers_pharm)
        self.assertEqual(res_con.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated request -> 401
        res_anon = self.client.get("/api/consultations/")
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_doctor_dashboard_stats_are_scoped_and_match_dashboard_contract(self):
        from cms_backendapp.models import Staff

        # Add a completed visit, one pending lab, and one pending prescription for this doctor.
        Appointment.objects.create(
            appointment_id="appt-complete",
            patient=self.patient,
            doctor=self.doctor,
            department=self.dept,
            appointment_date=datetime.date.today(),
            time_slot="11:00",
            status=Appointment.Status.COMPLETED,
        )
        ConsultationRecord.objects.create(
            record_id="con-own",
            patient=self.patient,
            doctor=self.doctor,
            appointment=self.appointment,
            visit_date=datetime.date.today(),
            diagnosis="Own doctor record",
        )
        LabTest.objects.create(
            test_id="lab-own",
            patient=self.patient,
            doctor=self.doctor,
            appointment=self.appointment,
            test_catalog=self.catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.PROCESSING,
        )
        LabTest.objects.create(
            test_id="lab-in-progress",
            patient=self.patient,
            doctor=self.doctor,
            appointment=self.appointment,
            test_catalog=self.catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.IN_PROGRESS,
        )
        Prescription.objects.create(
            prescription_id="rx-own",
            patient=self.patient,
            doctor=self.doctor,
            appointment=self.appointment,
            date_issued=datetime.date.today(),
            status=Prescription.Status.PENDING,
        )

        other_staff = Staff.objects.create(
            staff_id="staff-doc-02",
            name="Dr. Other",
            email="other.doc@clinova.test",
            role=self.role_doc,
            department=self.dept,
            is_active=True,
        )
        other_doctor = Doctor.objects.create(
            doctor_id="doc-02",
            staff=other_staff,
            department=self.dept,
            consultation_fee=Decimal("500.00"),
        )
        other_patient = Patient.objects.create(
            patient_id="pat-other",
            mrn="CLN-2025-0002",
            name="Other Doctor Patient",
            dob=datetime.date(1990, 1, 1),
            gender="F",
            assigned_doctor=other_doctor,
            is_active=True,
        )
        other_appointment = Appointment.objects.create(
            appointment_id="appt-other",
            patient=other_patient,
            doctor=other_doctor,
            department=self.dept,
            appointment_date=datetime.date.today(),
            time_slot="12:00",
            status=Appointment.Status.SCHEDULED,
        )
        ConsultationRecord.objects.create(
            record_id="con-other",
            patient=other_patient,
            doctor=other_doctor,
            appointment=other_appointment,
            visit_date=datetime.date.today(),
            diagnosis="Other doctor record",
        )
        LabTest.objects.create(
            test_id="lab-other",
            patient=other_patient,
            doctor=other_doctor,
            test_catalog=self.catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.ORDERED,
        )
        Prescription.objects.create(
            prescription_id="rx-other",
            patient=other_patient,
            doctor=other_doctor,
            date_issued=datetime.date.today(),
            status=Prescription.Status.PENDING,
        )
        ConsultationRecord.objects.create(
            record_id="con-shared",
            patient=self.patient,
            doctor=other_doctor,
            visit_date=datetime.date.today(),
            diagnosis="Prior clinician record",
        )
        Prescription.objects.create(
            prescription_id="rx-shared",
            patient=self.patient,
            doctor=other_doctor,
            date_issued=datetime.date.today(),
            status=Prescription.Status.DISPENSED,
        )
        LabTest.objects.create(
            test_id="lab-shared",
            patient=self.patient,
            doctor=other_doctor,
            test_catalog=self.catalog,
            ordered_date=datetime.date.today(),
            status=LabTest.Status.COMPLETED,
        )

        response = self.client.get("/api/dashboard/doctor/", **self.auth_headers(self.user_doc))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["todayAppointments"], 2)
        self.assertEqual(response.data["patients"], 1)
        self.assertEqual(response.data["pendingAppointments"], 1)
        self.assertEqual(response.data["completedConsultations"], 1)
        self.assertEqual(response.data["pendingLabs"], 2)
        self.assertEqual(response.data["activePrescriptions"], 1)
        self.assertEqual(
            {lab["id"] for lab in response.data["pendingLabsList"]},
            {"lab-own", "lab-in-progress"},
        )

        headers = self.auth_headers(self.user_doc)
        patients_response = self.client.get("/api/patients/?doctor_scope=mine", **headers)
        self.assertEqual({row["id"] for row in patients_response.data["results"]}, {"pat-01"})
        other_patient_response = self.client.get("/api/patients/pat-other/", **headers)
        self.assertEqual(other_patient_response.status_code, status.HTTP_404_NOT_FOUND)

        appointments_response = self.client.get("/api/appointments/?doctor=staff-doc-02", **headers)
        self.assertEqual({row["id"] for row in appointments_response.data["results"]}, {"appt-001", "appt-complete"})
        own_appointments_response = self.client.get("/api/appointments/", **headers)
        self.assertEqual({row["id"] for row in own_appointments_response.data["results"]}, {"appt-001", "appt-complete"})
        consultations_response = self.client.get("/api/consultations/?doctor=staff-doc-02", **headers)
        self.assertEqual(consultations_response.data["results"], [])
        own_consultations_response = self.client.get("/api/consultations/", **headers)
        self.assertEqual({row["id"] for row in own_consultations_response.data["results"]}, {"con-own"})
        prescriptions_response = self.client.get("/api/prescriptions/?doctor=staff-doc-02", **headers)
        self.assertEqual(prescriptions_response.data["results"], [])
        own_prescriptions_response = self.client.get("/api/prescriptions/", **headers)
        self.assertEqual({row["id"] for row in own_prescriptions_response.data["results"]}, {"rx-own"})
        labs_response = self.client.get("/api/lab-orders/?doctor=staff-doc-02", **headers)
        self.assertEqual(labs_response.data["results"], [])
        own_labs_response = self.client.get("/api/lab-orders/", **headers)
        self.assertEqual({row["id"] for row in own_labs_response.data["results"]}, {"lab-own", "lab-in-progress"})
        other_history_response = self.client.get("/api/patients/pat-other/clinical-history/", **headers)
        self.assertEqual(other_history_response.status_code, status.HTTP_404_NOT_FOUND)
        own_history_response = self.client.get("/api/patients/pat-01/clinical-history/", **headers)
        self.assertEqual(own_history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {row["record_id"] for row in own_history_response.data["consultations"]},
            {"con-own", "con-shared"},
        )
        self.assertEqual(
            {row["prescription_id"] for row in own_history_response.data["prescriptions"]},
            {"rx-own", "rx-shared"},
        )
        self.assertEqual(
            {row["test_id"] for row in own_history_response.data["labOrders"]},
            {"lab-own", "lab-in-progress", "lab-shared"},
        )

        foreign_consult_response = self.client.post(
            "/api/consultations/get-or-create/",
            {"appointmentId": "appt-other"},
            format="json",
            **headers,
        )
        self.assertEqual(foreign_consult_response.status_code, status.HTTP_404_NOT_FOUND)
        foreign_prescription_response = self.client.post(
            "/api/prescriptions/",
            {"patientId": "pat-01", "doctorId": "staff-doc-02", "items": [{"medicineId": "med-02", "quantity": 1}]},
            format="json",
            **headers,
        )
        self.assertEqual(foreign_prescription_response.status_code, status.HTTP_403_FORBIDDEN)
        foreign_lab_response = self.client.post(
            "/api/lab-orders/",
            {"patientId": "pat-01", "doctorId": "staff-doc-02", "testId": "test-01"},
            format="json",
            **headers,
        )
        self.assertEqual(foreign_lab_response.status_code, status.HTTP_403_FORBIDDEN)

        pharmacist_response = self.client.get(
            "/api/dashboard/doctor/", **self.auth_headers(self.user_pharm)
        )
        self.assertEqual(pharmacist_response.status_code, status.HTTP_403_FORBIDDEN)
