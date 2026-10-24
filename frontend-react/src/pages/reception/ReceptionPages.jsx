import React from 'react';
import ModulePage from '../shared/ModulePage';

export { ReceptionPatientsPage } from './ReceptionPatientsPage';

export { ReceptionAppointmentsPage } from './ReceptionAppointmentsPage';

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
