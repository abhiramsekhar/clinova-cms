import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { appointmentsApi, billsApi, labOrdersApi, patientsApi } from '../../api/resources';
import { useAuth } from '../../auth/AuthContext';
import Badge from '../../components/Badge';
import { ErrorState, LoadingState } from '../../components/States';
import { DataTable, Tabs } from '../../components/ui';
import { Format, formatDate, formatDateTime, formatTime } from '../../utils/format';

function rowsFrom(data) {
  return Array.isArray(data) ? data : (data?.results || []);
}

export default function PatientProfilePage() {
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('id')?.trim();
  const { role, user } = useAuth();
  const staffKey = user?.staffId || user?.id || 'current-user';
  const [activeTab, setActiveTab] = useState('overview');
  const canViewBilling = role === 'RECEPTIONIST' || role === 'ADMIN';
  const backPath = role === 'DOCTOR' ? '/doctor/patients' : role === 'ADMIN' ? '/admin/dashboard' : '/reception/patients';

  const patientQuery = useQuery({
    queryKey: ['patientProfile', staffKey, patientId],
    queryFn: () => patientsApi.get(patientId),
    enabled: Boolean(patientId),
  });
  const historyQuery = useQuery({
    queryKey: ['patientClinicalHistory', staffKey, patientId],
    queryFn: () => patientsApi.clinicalHistory(patientId),
    enabled: Boolean(patientId),
  });
  const doctorLabsQuery = useQuery({
    queryKey: ['patientProfileDoctorLabs', staffKey, patientId],
    queryFn: () => labOrdersApi.list({ patient: patientId, doctor: 'me', page_size: 200 }),
    enabled: Boolean(patientId) && role === 'DOCTOR',
  });
  const appointmentsQuery = useQuery({
    queryKey: ['patientAppointments', staffKey, patientId],
    queryFn: () => appointmentsApi.list({ patient: patientId }),
    enabled: Boolean(patientId),
  });
  const billsQuery = useQuery({
    queryKey: ['patientBills', staffKey, patientId],
    queryFn: () => billsApi.list({ patient: patientId }),
    enabled: Boolean(patientId) && canViewBilling,
  });

  if (!patientId) {
    return <ErrorState title="Patient ID is missing" error="Open a patient from the directory to view their record." />;
  }
  if (patientQuery.isLoading) return <LoadingState message="Loading patient record..." />;
  if (patientQuery.error) {
    return <ErrorState title="Unable to load patient record" error={patientQuery.error} onRetry={patientQuery.refetch} />;
  }

  const patient = patientQuery.data;
  const history = historyQuery.data || {};
  const appointments = rowsFrom(appointmentsQuery.data);
  const bills = rowsFrom(billsQuery.data);
  const labRows = role === 'DOCTOR' ? rowsFrom(doctorLabsQuery.data) : (history.labOrders || []);
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'consultations', label: 'Consultations' },
    { key: 'prescriptions', label: 'Prescriptions' },
    { key: 'labs', label: 'Lab Results' },
    ...(canViewBilling ? [{ key: 'billing', label: 'Billing' }] : []),
  ];

  const appointmentColumns = [
    { key: 'appointmentDate', label: 'Date', sortable: true, render: (row) => formatDate(row.date || row.appointmentDate) },
    { key: 'time', label: 'Time', render: (row) => formatTime(row.time || row.slotTime) },
    { key: 'doctorName', label: 'Doctor', sortable: true, render: (row) => row.doctorName || row.doctor?.name || '-' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
  ];
  const consultationColumns = [
    { key: 'visit_date', label: 'Date', sortable: true, render: (row) => formatDate(row.visit_date) },
    { key: 'doctor__staff__name', label: 'Doctor', render: (row) => row['doctor__staff__name'] || '-' },
    { key: 'diagnosis', label: 'Diagnosis', render: (row) => row.diagnosis || '-' },
    { key: 'symptoms', label: 'Symptoms', render: (row) => row.symptoms || '-' },
  ];
  const prescriptionColumns = [
    { key: 'created_at', label: 'Date', sortable: true, render: (row) => formatDateTime(row.created_at) },
    { key: 'doctor__staff__name', label: 'Doctor', render: (row) => row['doctor__staff__name'] || '-' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
  ];
  const labColumns = [
    { key: role === 'DOCTOR' ? 'orderedDate' : 'ordered_date', label: 'Date', sortable: true, render: (row) => formatDate(row.orderedDate || row.ordered_date) },
    { key: role === 'DOCTOR' ? 'testName' : 'test_catalog__test_name', label: 'Test', render: (row) => row.testName || row['test_catalog__test_name'] || '-' },
    { key: 'priority', label: 'Priority', render: (row) => <Badge status={row.priority} /> },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    ...(role === 'DOCTOR' ? [{ key: 'results', label: 'Result', render: (row) => row.results ? <details><summary>{row.isCritical ? 'Critical' : 'View result'}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.results, null, 2)}</pre></details> : 'Awaiting result' }] : []),
  ];
  const billColumns = [
    { key: 'id', label: 'Invoice', sortable: true, render: (row) => row.billNumber || row.id || row.bill_id },
    { key: 'createdAt', label: 'Date', sortable: true, render: (row) => formatDate(row.createdAt || row.created_at || row.billDate) },
    { key: 'totalAmount', label: 'Amount', render: (row) => Format.money(row.totalAmount) },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to={backPath} className="btn btn--ghost btn--sm">← Back</Link>
      </div>
      {patient.allergies?.length > 0 && (
        <div className="glass card" role="alert" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', borderColor: 'var(--danger)' }}>
          <strong>Allergies:</strong> {patient.allergies.join(', ')}
        </div>
      )}
      <section className="glass card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h1 className="text-page-title" style={{ margin: '0 0 0.25rem' }}>{patient.name}</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 1rem' }}>{patient.mrn || 'MRN unavailable'}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
          <div><strong>Age / Gender</strong><div>{Format.age(patient.dateOfBirth)}, {patient.gender || '-'}</div></div>
          <div><strong>Blood Group</strong><div>{patient.bloodGroup || '-'}</div></div>
          <div><strong>Phone</strong><div>{patient.phone || '-'}</div></div>
          <div><strong>Guardian</strong><div>{patient.guardianName ? `${patient.guardianName} (${patient.guardianPhone || '-'})` : '-'}</div></div>
        </div>
      </section>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'overview' && (
        <section className="glass card" style={{ padding: '1.5rem' }}>
          <h2 className="text-card-title">Patient Overview</h2>
          <p><strong>Email:</strong> {patient.email || '-'}</p>
          <p><strong>Address:</strong> {patient.address || '-'}</p>
          <p><strong>Chronic Conditions:</strong> {Array.isArray(patient.chronicConditions) ? patient.chronicConditions.join(', ') || 'None reported' : patient.chronicConditions || 'None reported'}</p>
          <p><strong>Registered:</strong> {formatDate(patient.registeredOn || patient.createdAt)}</p>
        </section>
      )}
      {activeTab === 'appointments' && (
        <section className="glass card" style={{ padding: '1.25rem' }}>
          {appointmentsQuery.error ? <ErrorState title="Unable to load appointments" error={appointmentsQuery.error} onRetry={appointmentsQuery.refetch} /> : <DataTable columns={appointmentColumns} data={appointments} isLoading={appointmentsQuery.isLoading} emptyTitle="No appointments found" />}
        </section>
      )}
      {activeTab === 'consultations' && (
        <section className="glass card" style={{ padding: '1.25rem' }}>
          {historyQuery.error ? <ErrorState title="Unable to load clinical history" error={historyQuery.error} onRetry={historyQuery.refetch} /> : <DataTable columns={consultationColumns} data={history.consultations || []} isLoading={historyQuery.isLoading} emptyTitle="No consultations found" />}
        </section>
      )}
      {activeTab === 'prescriptions' && (
        <section className="glass card" style={{ padding: '1.25rem' }}>
          {historyQuery.error ? <ErrorState title="Unable to load clinical history" error={historyQuery.error} onRetry={historyQuery.refetch} /> : <DataTable columns={prescriptionColumns} data={history.prescriptions || []} isLoading={historyQuery.isLoading} emptyTitle="No prescriptions found" />}
        </section>
      )}
      {activeTab === 'labs' && (
        <section className="glass card" style={{ padding: '1.25rem' }}>
          {role === 'DOCTOR' && doctorLabsQuery.error
            ? <ErrorState title="Unable to load lab results" error={doctorLabsQuery.error} onRetry={doctorLabsQuery.refetch} />
            : historyQuery.error
              ? <ErrorState title="Unable to load lab history" error={historyQuery.error} onRetry={historyQuery.refetch} />
              : <DataTable columns={labColumns} data={labRows} isLoading={historyQuery.isLoading || (role === 'DOCTOR' && doctorLabsQuery.isLoading)} emptyTitle="No lab results found" />}
        </section>
      )}
      {activeTab === 'billing' && canViewBilling && (
        <section className="glass card" style={{ padding: '1.25rem' }}>
          {billsQuery.error ? <ErrorState title="Unable to load billing history" error={billsQuery.error} onRetry={billsQuery.refetch} /> : <DataTable columns={billColumns} data={bills} isLoading={billsQuery.isLoading} emptyTitle="No bills found" />}
        </section>
      )}
    </div>
  );
}
