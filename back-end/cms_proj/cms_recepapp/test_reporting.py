import datetime
from unittest.mock import patch
from decimal import Decimal
from django.utils import timezone
from cms_recepapp import tests as fixtures
from cms_recepapp.models import Appointment, Bill, Payment, BillItem
from cms_recepapp.services import get_slot_board, mark_expired_scheduled_appointments

from rest_framework.test import APITestCase

class ReportingTests(APITestCase):
    setUp = fixtures.ReceptionGroupTests.setUp
    auth_headers = fixtures.ReceptionGroupTests.auth_headers
    # Reuse fixtures, without inheriting the legacy behavior assertions.
    def reserve(self, days=1):
        return self.client.post('/api/appointments/book-and-pay/', {
            'patientId': self.patient.pk, 'doctorId': self.doctor.pk, 'mode': 'PRIOR',
            'date': (self.today + datetime.timedelta(days=days)).isoformat(), 'time': '11:00'
        }, format='json', **self.auth_headers(self.user_rec))

    def report(self, appointment, **changes):
        payload = {'arrivalConfirmed': True, 'registrationVerified': True,
                   'payment': {'confirmed': True, 'method': 'CASH'}, 'expectedTotal': 70000}
        payload.update(changes)
        return self.client.post(f'/api/appointments/{appointment.pk}/check-in/', payload,
                                format='json', **self.auth_headers(self.user_rec))

    def reservation(self):
        response = self.reserve()
        self.assertEqual(response.status_code, 201, response.data)
        return Appointment.objects.get(pk=response.data['appointment']['id'])

    def clock(self, appointment, hour, minute):
        return patch('django.utils.timezone.now', return_value=timezone.make_aware(
            datetime.datetime.combine(appointment.appointment_date, datetime.time(hour, minute))))

    def test_reservation_bounds_and_no_premature_payment(self):
        before = (Bill.objects.count(), Payment.objects.count())
        appt = self.reservation()
        self.assertEqual(appt.status, 'SCHEDULED')
        self.assertIsNone(appt.token_number)
        self.assertEqual(before, (Bill.objects.count(), Payment.objects.count()))
        for days in [0, -1, 29]:
            self.assertEqual(self.reserve(days).status_code, 400)

    def test_reporting_payment_token_and_retry(self):
        appt = self.reservation()
        self.doctor.consultation_fee = Decimal('650')
        self.doctor.save()
        with self.clock(appt, 10, 35):
            response = self.report(appt, expectedTotal=85000)
            self.assertEqual(response.status_code, 200, response.data)
            counts = (Bill.objects.count(), Payment.objects.count())
            self.assertEqual(self.report(appt).status_code, 200)
            self.assertEqual(counts, (Bill.objects.count(), Payment.objects.count()))
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'CHECKED_IN')
        self.assertEqual(appt.token_number, 5)
        self.assertEqual(appt.bills.get().total_amount, Decimal('850'))

    def test_failed_payment_rolls_back(self):
        appt = self.reservation()
        before = Payment.objects.count()
        with self.clock(appt, 10, 35):
            self.assertEqual(self.report(appt, payment={'confirmed': False}).status_code, 400)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'SCHEDULED')
        self.assertIsNone(appt.token_number)
        self.assertFalse(appt.bills.exists())
        self.assertEqual(Payment.objects.count(), before)

    def test_registration_already_paid(self):
        bill = Bill.objects.create(patient=self.patient, bill_date=self.today, total_amount=200)
        BillItem.objects.create(bill=bill, item_type='REGISTRATION', description='Registration', amount=200)
        Payment.objects.create(bill=bill, amount_paid=200, payment_date=self.today)
        appt = self.reservation()
        with self.clock(appt, 10, 35):
            response = self.report(appt, expectedTotal=50000)
            self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(appt.bills.get().items.filter(item_type='REGISTRATION').exists())

    def test_release_and_late_reassignment_preserves_history(self):
        appt = self.reservation()
        with self.clock(appt, 10, 46):
            self.assertEqual(mark_expired_scheduled_appointments(doctor=self.doctor), 2)
            self.assertEqual(mark_expired_scheduled_appointments(), 0)
            board = get_slot_board(self.doctor.pk, appt.appointment_date)
            self.assertEqual(next(s for s in board if s['time'] == '11:00')['state'], 'free')
            other = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
                appointment_date=appt.appointment_date, time_slot='11:00', status='CHECKED_IN', token_number=5)
            response = self.report(appt, time='11:30')
            self.assertEqual(response.status_code, 200, response.data)
            replacement = response.data['id']
            counts = (Appointment.objects.count(), Payment.objects.count())
            self.assertEqual(self.report(appt, time='11:30').data['id'], replacement)
            self.assertEqual(counts, (Appointment.objects.count(), Payment.objects.count()))
        appt.refresh_from_db(); other.refresh_from_db()
        self.assertEqual(appt.status, 'REBOOKED')
        self.assertIsNone(appt.token_number)
        self.assertEqual(other.time_slot, '11:00')

        self.assertEqual(appt.time_slot, '11:00')
        original_data = self.client.get(f'/api/appointments/{appt.pk}/', **self.auth_headers(self.user_rec)).data
        self.assertTrue(original_data['lateArrivalHandled'])
        self.assertEqual(original_data['replacementAppointmentId'], replacement)
        self.assertFalse(original_data['tokenConfirmed'])
        self.assertEqual(original_data['status'], 'REBOOKED')
        from cms_backendapp.models import AuditLog
        self.assertTrue(AuditLog.objects.filter(action='AUTO_NO_SHOW_APPOINTMENT', entity_id=appt.pk).exists())
        self.assertEqual(AuditLog.objects.filter(action='LATE_ARRIVAL_REASSIGNED', entity_id=appt.pk).count(), 1)

    def test_cancellation_releases_and_keeps_bill(self):
        response = self.client.post(f'/api/appointments/{self.appointment.pk}/cancel/',
            {'reason': 'Changed plans'}, format='json', **self.auth_headers(self.user_rec))
        self.assertEqual(response.status_code, 200)
        self.bill.refresh_from_db()
        self.assertEqual(self.bill.payment_status, 'PARTIAL')
        board = get_slot_board(self.doctor.pk, self.today)
        slot = next(s for s in board if s['time'] == '10:00')
        self.assertEqual(slot['state'], 'free')
        self.assertNotEqual(slot['token'], 3)
        self.assertTrue(Payment.objects.filter(pk=self.payment.pk).exists())

    def test_missed_reservation_can_be_used_by_walkin(self):
        appt = self.reservation()
        from cms_recepapp.models import Patient
        patient = Patient.objects.create(name='Walk-in patient')
        with self.clock(appt, 10, 46):
            response = self.client.post('/api/appointments/book-and-pay/', {
                'patientId': patient.pk, 'doctorId': self.doctor.pk, 'mode': 'WALK_IN',
                'date': appt.appointment_date.isoformat(), 'time': '11:00',
                'arrivalConfirmed': True, 'payment': {'confirmed': True, 'method': 'CASH'}
            }, format='json', **self.auth_headers(self.user_rec))
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(response.data['appointment']['status'], 'CHECKED_IN')
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'NO_SHOW')
        self.assertIsNone(appt.token_number)
        self.assertFalse(appt.bills.exists())

    def test_payment_exception_retains_previous_successful_records(self):
        from rest_framework.exceptions import ValidationError
        self.appointment.token_number = None
        self.appointment.save(update_fields=['token_number'])
        before = list(self.bill.payments.values_list('pk', 'amount_paid'))
        create = Payment.objects.create
        def fail(**kwargs):
            create(**kwargs)
            raise ValidationError('Payment failed')
        with self.clock(self.appointment, 9, 35), patch('cms_recepapp.views.Payment.objects.create', side_effect=fail):
            response = self.report(self.appointment, expectedTotal=35000)
            self.assertEqual(response.status_code, 400)
        self.assertEqual(before, list(self.bill.payments.values_list('pk', 'amount_paid')))
        self.appointment.refresh_from_db()
        self.assertIsNone(self.appointment.token_number)
        self.assertEqual(self.appointment.status, 'SCHEDULED')

    def test_early_reporting_and_unavailable_doctor(self):
        appt = self.reservation()
        with self.clock(appt, 10, 29):
            self.assertEqual(self.report(appt).status_code, 400)
        self.staff_doc.is_active = False
        self.staff_doc.save()
        with self.clock(appt, 10, 35):
            self.assertEqual(self.report(appt).status_code, 400)
        self.assertFalse(appt.bills.exists())

    def test_repeated_cancellation_has_one_history_entry(self):
        from cms_backendapp.models import AuditLog
        appt = self.reservation()
        for _ in range(2):
            response = self.client.post(f'/api/appointments/{appt.pk}/cancel/',
                {'reason': 'Changed plans'}, format='json', **self.auth_headers(self.user_rec))
            self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action='CANCEL_APPOINTMENT', entity_id=appt.pk).count(), 1)
        self.assertFalse(appt.bills.exists())

    def test_unpaid_reservation_preview_does_not_collide_with_released_token(self):
        self.appointment.status = 'CANCELLED'
        self.appointment.token_number = 1
        self.appointment.save(update_fields=['status', 'token_number'])
        reservation = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
            appointment_date=self.today, time_slot='09:30', status='SCHEDULED')
        board = get_slot_board(self.doctor.pk, self.today)
        tokens = [slot['token'] for slot in board if slot['state'] in ['free', 'booked']]
        self.assertEqual(len(tokens), len(set(tokens)))
        self.assertNotIn(1, tokens)
    def test_false_paid_cache_cannot_confirm_token(self):
        self.appointment.token_number = None
        self.appointment.save(update_fields=['token_number'])
        Bill.objects.filter(pk=self.bill.pk).update(amount_paid=850, payment_status='PAID')
        with self.clock(self.appointment, 9, 35):
            self.assertEqual(self.report(self.appointment).status_code, 400)
        self.appointment.refresh_from_db()
        self.assertIsNone(self.appointment.token_number)
        self.assertEqual(self.appointment.status, 'SCHEDULED')

    def test_missing_saved_payment_cannot_confirm_token(self):
        appt = self.reservation()
        with self.clock(appt, 10, 35), patch('cms_recepapp.views.Payment.objects.create', return_value=None):
            self.assertEqual(self.report(appt).status_code, 400)
        appt.refresh_from_db()
        self.assertIsNone(appt.token_number)
        self.assertEqual(appt.status, 'SCHEDULED')
        self.assertFalse(appt.bills.exists())
    def test_booking_quote_reports_dynamic_window_and_new_patient_fees(self):
        date = (self.today + datetime.timedelta(days=1)).isoformat()
        response = self.client.get('/api/appointments/booking-quote/', {
            'patient': self.patient.pk, 'doctor': self.doctor.pk, 'date': date, 'time': '11:00'
        }, **self.auth_headers(self.user_rec))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['registrationFee'], 20000)
        self.assertEqual(response.data['consultationFee'], 50000)
        self.assertEqual(response.data['total'], 70000)
        self.assertIn('T10:30:00', response.data['reportingStartsAt'])
        self.assertIn('T10:45:00', response.data['reportingDeadlineAt'])

    def test_reporting_quote_uses_existing_balance_without_duplicate_charge(self):
        response = self.client.get('/api/appointments/booking-quote/', {
            'patient': self.patient.pk, 'doctor': self.doctor.pk, 'appointmentId': self.appointment.pk
        }, **self.auth_headers(self.user_rec))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 35000)
        self.assertFalse(response.data['registrationFeeDue'])

    def test_failed_late_rebooking_keeps_no_show_and_allows_retry(self):
        appt = self.reservation()
        from rest_framework.exceptions import ValidationError
        from cms_backendapp.models import AuditLog
        with self.clock(appt, 12, 0):
            mark_expired_scheduled_appointments()
            counts = (Appointment.objects.count(), Payment.objects.count(), Bill.objects.count())
            with patch('cms_recepapp.views.Payment.objects.create', side_effect=ValidationError('Failed payment')):
                response = self.report(appt, time='12:00')
                self.assertEqual(response.status_code, 400)
            appt.refresh_from_db()
            self.assertEqual(appt.status, 'NO_SHOW')
            self.assertFalse(AuditLog.objects.filter(action='LATE_ARRIVAL_REASSIGNED', entity_id=appt.pk).exists())
            self.assertEqual(counts, (Appointment.objects.count(), Payment.objects.count(), Bill.objects.count()))
            response = self.report(appt, time='12:00')
            self.assertEqual(response.status_code, 200, response.data)
            appt.refresh_from_db()
            self.assertEqual(appt.status, 'REBOOKED')

    def test_legacy_link_is_idempotent_even_when_replacement_no_longer_active(self):
        from cms_backendapp.models import AuditLog
        self.appointment.status = 'NO_SHOW'
        self.appointment.save(update_fields=['status'])
        replacement = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
            appointment_date=self.today, time_slot='12:00', status='CANCELLED', token_number=7)
        AuditLog.objects.create(action='LATE_ARRIVAL_REASSIGNED', entity_type='APPOINTMENT',
            entity_id=self.appointment.pk, details={'replacementId': replacement.pk, 'billId': self.bill.pk})
        counts = (Appointment.objects.count(), Payment.objects.count())
        response = self.report(self.appointment)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], replacement.pk)
        self.assertEqual(counts, (Appointment.objects.count(), Payment.objects.count()))
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.status, 'REBOOKED')
        slot = next(s for s in get_slot_board(self.doctor.pk, self.today) if s['time'] == '10:00')
        self.assertEqual(slot['state'], 'free')
        self.assertNotEqual(slot['token'], 3)

    def test_rebooked_without_link_rejects_retry(self):
        self.appointment.status = 'REBOOKED'
        self.appointment.save(update_fields=['status'])
        counts = (Appointment.objects.count(), Payment.objects.count())
        self.assertEqual(self.report(self.appointment).status_code, 400)
        self.assertEqual(counts, (Appointment.objects.count(), Payment.objects.count()))

    def test_migration_backfills_existing_audit_links_only(self):
        import importlib
        from types import SimpleNamespace
        from django.apps import apps
        from django.db import connection
        from cms_backendapp.models import AuditLog
        migration = importlib.import_module('cms_recepapp.migrations.0006_appointment_rebooked_status')
        self.appointment.status = 'NO_SHOW'
        self.appointment.save(update_fields=['status'])
        replacement = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
            appointment_date=self.today, time_slot='12:00', status='CHECKED_IN', token_number=7)
        AuditLog.objects.create(action='LATE_ARRIVAL_REASSIGNED', entity_type='APPOINTMENT', entity_id=self.appointment.pk,
            details={'replacementId': replacement.pk, 'billId': self.bill.pk})
        unrelated = Appointment.objects.create(patient=self.patient, doctor=self.doctor,
            appointment_date=self.today, time_slot='13:00', status='NO_SHOW')
        for _ in range(2):
            migration.backfill_rebooked(apps, SimpleNamespace(connection=connection))
        self.appointment.refresh_from_db(); unrelated.refresh_from_db()
        self.assertEqual(self.appointment.status, 'REBOOKED')
        self.assertEqual(unrelated.status, 'NO_SHOW')
    def test_failure_after_replacement_save_rolls_back_handled_status_and_new_charge(self):
        from rest_framework.exceptions import ValidationError
        from cms_backendapp.models import AuditLog
        self.appointment.status = 'NO_SHOW'
        self.appointment.save(update_fields=['status'])
        counts = (Appointment.objects.count(), Payment.objects.count(), Bill.objects.count())
        with self.clock(self.appointment, 12, 0), patch('cms_recepapp.views.log_audit', side_effect=ValidationError('Audit could not be saved')):
            response = self.report(self.appointment, time='12:00', expectedTotal=35000)
            self.assertEqual(response.status_code, 400)
        self.appointment.refresh_from_db(); self.bill.refresh_from_db()
        self.assertEqual(self.appointment.status, 'NO_SHOW')
        self.assertEqual(self.appointment.token_number, 3)
        self.assertEqual(self.bill.amount_paid, Decimal('500'))
        self.assertEqual(counts, (Appointment.objects.count(), Payment.objects.count(), Bill.objects.count()))
        self.assertFalse(AuditLog.objects.filter(action='LATE_ARRIVAL_REASSIGNED', entity_id=self.appointment.pk).exists())
