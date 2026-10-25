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

    def test_prescription_partial_dispense(self):
        headers_doc = self.auth_headers(self.user_doc)
        headers_pharm = self.auth_headers(self.user_pharm)

        # Med Paracetamol has stock_quantity=50. Prescribe 75 units.
        payload = {
            "patientId": "pat-01",
            "doctorId": "staff-doc-01",
            "items": [{"medicineId": "med-02", "quantity": 75}],
        }
        res_rx = self.client.post("/api/prescriptions/", payload, format="json", **headers_doc)
        self.assertEqual(res_rx.status_code, status.HTTP_201_CREATED)
        rx_id = res_rx.data["id"]

        # Pharmacist dispenses
        res_disp = self.client.post(f"/api/prescriptions/{rx_id}/dispense/", {"payment": {"status": "PAID"}}, format="json", **headers_pharm)
        self.assertEqual(res_disp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_disp.data["status"], "PARTIALLY_DISPENSED")

        # Verify stock decremented to 0
        self.med_para.refresh_from_db()
        self.assertEqual(self.med_para.stock_quantity, 0)

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
