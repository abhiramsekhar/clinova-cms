import React from 'react';
import ModulePage from '../shared/ModulePage';

export function DoctorAppointmentsPage() {
  return (
    <ModulePage
      title="My Appointments"
      subtitle="Detailed daily schedule, booked consultation slots, and patient statuses"
      icon="icon-calendar"
    />
  );
}

export function DoctorPatientsPage() {
  return (
    <ModulePage
      title="Patient Records"
      subtitle="Patients under active clinical care and consultation history"
      icon="icon-users"
    />
  );
}

export function DoctorPrescriptionsPage() {
  return (
    <ModulePage
      title="Prescription Management"
      subtitle="Review written prescriptions, dosage instructions, and dispensing updates"
      icon="icon-clipboard-list"
      actionLabel="Write Prescription"
    />
  );
}

export function DoctorLabOrdersPage() {
  return (
    <ModulePage
      title="Diagnostic Lab Orders"
      subtitle="Order clinical laboratory tests and track diagnostic reports"
      icon="icon-flask"
      actionLabel="Order Investigation"
    />
  );
}

export function DoctorClinicalHistoryPage() {
  return (
    <ModulePage
      title="Clinical History & Timeline"
      subtitle="Longitudinal medical history, past diagnoses, medications, and lab trends"
      icon="icon-history"
    />
  );
}

export function DoctorConsultationPage() {
  return (
    <ModulePage
      title="Patient Consultation"
      subtitle="Active consultation examination, clinical notes, diagnosis, and prescription"
      icon="icon-clipboard-list"
    />
  );
}
