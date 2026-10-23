import React from 'react';
import ModulePage from '../shared/ModulePage';

export function ReceptionPatientsPage() {
  return (
    <ModulePage
      title="Patient Registration"
      subtitle="Register new patients, issue Medical Record Numbers (MRN), and update contact information"
      icon="icon-users"
      actionLabel="Register New Patient"
    />
  );
}

export function ReceptionAppointmentsPage() {
  return (
    <ModulePage
      title="Appointment Booking & Slots"
      subtitle="Book consultation appointments, manage walk-in queues, and check-in arrivals"
      icon="icon-calendar"
      actionLabel="Book Appointment"
    />
  );
}

export function ReceptionBillingPage() {
  return (
    <ModulePage
      title="Front Desk Invoicing & Payments"
      subtitle="Generate registration bills, receive payments in cash/card/UPI, and print receipts"
      icon="icon-receipt"
      actionLabel="Receive Payment"
    />
  );
}
