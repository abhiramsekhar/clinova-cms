import datetime
from decimal import Decimal
from unittest.mock import patch
from django.utils import timezone
from rest_framework.test import APITestCase
from cms_recepapp import tests as fixtures
from cms_recepapp.models import Appointment
from cms_recepapp.services import get_slot_board
from cms_backendapp.models import Staff, Department
from cms_doctorapp.models import Doctor


class PriorSlotNumberTests(APITestCase):
    setUp = fixtures.ReceptionGroupTests.setUp

    def doctors(self):
        result = [self.doctor]
        for i, (name, department) in enumerate([
            ('Dr. Sreelakshmi Nair', 'Gynaecology'),
            ('Dr. Meera Krishnan', 'Orthopaedics'),
        ]):
            dept = Department.objects.create(department_id=f'slot-dept-{i}', name=department, code=f'SLOT{i}')
            staff = Staff.objects.create(staff_id=f'slot-staff-{i}', name=name,
                email=f'slot{i}@test.example', role=self.role_doc, department=dept)
            result.append(Doctor.objects.create(doctor_id=f'slot-doc-{i}', staff=staff,
                department=dept, consultation_fee=Decimal('500')))
        return result

    def assert_order(self, board):
        self.assertEqual([s['time'] for s in board[:4]], ['09:00', '09:30', '10:00', '10:30'])
        self.assertEqual([s['time'] for s in board], sorted(s['time'] for s in board))
        self.assertEqual([s['index'] for s in board], list(range(len(board))))

    def test_empty_days_start_at_one_for_both_affected_and_other_doctor(self):
        day = self.today + datetime.timedelta(days=1)
        for doctor in self.doctors():
            with self.subTest(doctor=doctor.staff.name):
                board = get_slot_board(doctor.pk, day)
                self.assert_order(board)
                self.assertEqual(board[0]['token'], 1)
                self.assertEqual(board[0]['state'], 'free')
                self.assertEqual(board, get_slot_board(doctor.staff_id, day))

    def test_cancelled_issued_token_is_not_reused_and_time_order_is_preserved(self):
        self.client.force_authenticate(self.user_rec)
        day = self.today + datetime.timedelta(days=1)
        for doctor in self.doctors():
            with self.subTest(doctor=doctor.staff.name):
                appointment = Appointment.objects.create(patient=self.patient, doctor=doctor,
                    appointment_date=day, time_slot='09:00', token_number=1, status='SCHEDULED')
                response = self.client.post(f'/api/appointments/{appointment.pk}/cancel/',
                    {'reason': 'Test cancellation'}, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                board = get_slot_board(doctor.pk, day)
                self.assert_order(board)
                self.assertEqual(board[0]['state'], 'free')
                self.assertEqual(board[0]['token'], 2)
                tokens = [s['token'] for s in board if s['state'] == 'free']
                self.assertNotIn(1, tokens)
                self.assertEqual(len(tokens), len(set(tokens)))
                appointment.refresh_from_db()
                self.assertEqual(appointment.token_number, 1)
                self.assertEqual(get_slot_board(doctor.pk, day + datetime.timedelta(days=1))[0]['token'], 1)

    def test_historical_token_one_at_later_slot_does_not_reorder_times(self):
        day = self.today + datetime.timedelta(days=1)
        for doctor in self.doctors():
            with self.subTest(doctor=doctor.staff.name):
                appointment = Appointment.objects.create(patient=self.patient, doctor=doctor,
                    appointment_date=day, time_slot='09:30', token_number=1, status='SCHEDULED')
                board = get_slot_board(doctor.pk, day)
                self.assert_order(board)
                self.assertEqual((board[0]['time'], board[0]['index'], board[0]['token']), ('09:00', 0, 2))
                self.assertEqual((board[1]['time'], board[1]['index'], board[1]['token']), ('09:30', 1, 1))
                self.assertEqual(board[1]['state'], 'booked')
                appointment.refresh_from_db()
                self.assertEqual(appointment.token_number, 1)

    def test_unissued_cancelled_prior_does_not_reserve_token_one(self):
        day = self.today + datetime.timedelta(days=1)
        for doctor in self.doctors():
            Appointment.objects.create(patient=self.patient, doctor=doctor,
                appointment_date=day, time_slot='09:00', status='CANCELLED', token_number=None)
            board = get_slot_board(doctor.pk, day)
            self.assertEqual((board[0]['state'], board[0]['token']), ('free', 1))

    def test_prior_reservation_and_reporting_keep_shifted_token_candidate(self):
        self.client.force_authenticate(self.user_rec)
        doctor = self.doctors()[-1]
        day = self.today + datetime.timedelta(days=1)
        historical = Appointment.objects.create(patient=self.patient, doctor=doctor,
            appointment_date=day, time_slot='09:00', token_number=1, status='CANCELLED')
        response = self.client.post('/api/appointments/book-and-pay/', {
            'patientId': self.patient.pk, 'doctorId': doctor.pk, 'mode': 'PRIOR',
            'date': day.isoformat(), 'time': '09:00',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data['appointment']['tokenNumber'])
        self.assertIsNone(response.data['bill'])
        appointment_id = response.data['appointment']['id']
        now = timezone.make_aware(datetime.datetime.combine(day, datetime.time(8, 35)))
        with patch('django.utils.timezone.now', return_value=now):
            response = self.client.post(f'/api/appointments/{appointment_id}/check-in/', {
                'arrivalConfirmed': True, 'registrationVerified': True, 'expectedTotal': 70000,
                'payment': {'confirmed': True, 'method': 'CASH'},
            }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['id'], appointment_id)
        self.assertEqual(response.data['status'], 'CHECKED_IN')
        self.assertEqual(response.data['tokenNumber'], 2)
        historical.refresh_from_db()
        self.assertEqual(historical.token_number, 1)
