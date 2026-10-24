import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi, consultationsApi, labCatalogApi, labOrdersApi, patientsApi, prescriptionsApi } from '../../api/resources';
import { useAuth } from '../../auth/AuthContext';
import Badge from '../../components/Badge';
import Icon from '../../components/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { DataTable, Modal, useToast } from '../../components/ui';
import { Format, formatDate, formatDateTime, formatTime } from '../../utils/format';
import './doctor-pages.css';

const PAGE_SIZE = 200;
const today = new Date().toISOString().slice(0, 10);

function rowsFrom(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
}

function PageHeader({ title, subtitle, icon, children }) {
  return (
    <div className="page-header doctor-page-header">
      <div className="page-header__info">
        <div className="doctor-page-heading">
          {icon && <Icon name={icon} size={20} />}
          <h1 className="text-page-title">{title}</h1>
        </div>
        {subtitle && <p className="text-caption">{subtitle}</p>}
      </div>
      <div className="page-header__actions">
        {children}
      </div>
    </div>
  );
}

function PatientLink({ patientId, children }) {
  return patientId
    ? <Link to={`/shared/patient-profile?id=${encodeURIComponent(patientId)}`}>{children}</Link>
    : children;
}

function useDoctorKey() {
  const { user } = useAuth();
  return user?.staffId || 'current-doctor';
}

export function DoctorAppointmentsPage() {
  const doctorKey = useDoctorKey();
  const [date, setDate] = useState(today);
  const query = useQuery({
    queryKey: ['doctorAppointments', doctorKey, date],
    queryFn: () => appointmentsApi.list({ doctor: 'me', date, page_size: PAGE_SIZE }),
  });
  const rows = rowsFrom(query.data);
  const columns = [
    { key: 'tokenNumber', label: 'Token', sortable: true, render: (row) => row.tokenNumber ?? '—' },
    { key: 'time', label: 'Time', sortable: true, render: (row) => formatTime(row.time) },
    { key: 'patientName', label: 'Patient', sortable: true, render: (row) => <PatientLink patientId={row.patientId}>{row.patientName || 'Patient'}</PatientLink> },
    { key: 'patientMrn', label: 'MRN', render: (row) => row.patientMrn || '—' },
    { key: 'type', label: 'Visit Type', render: (row) => row.type || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'actions', label: '', render: (row) => ['CHECKED_IN', 'IN_PROGRESS'].includes(row.status)
      ? <Link className="btn btn--secondary btn--sm" to={`/doctor/consultation?appointmentId=${encodeURIComponent(row.id)}`}>Consult</Link>
      : row.status === 'SCHEDULED' ? 'Awaiting check-in' : '—' },
  ];

  return (
    <div className="doctor-workspace">
      <PageHeader title="My Appointments" subtitle="Appointments for the selected day" icon="icon-calendar">
        <div className="doctor-header-filter">
          <label className="form-group__label" htmlFor="doctor-appointment-date">Date</label>
          <input id="doctor-appointment-date" className="form-control" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </PageHeader>
      {query.isLoading ? <LoadingState message="Loading appointments..." /> : query.error
        ? <ErrorState title="Unable to load appointments" error={query.error} onRetry={query.refetch} />
        : <section className="glass card doctor-panel" style={{ padding: '1rem' }}>
          <DataTable columns={columns} data={rows} showSearch searchPlaceholder="Search today's appointments..." emptyTitle="No appointments for this date" />
        </section>}
    </div>
  );
}

export function DoctorPatientsPage() {
  const doctorKey = useDoctorKey();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['doctorPatients', doctorKey, search.trim()],
    queryFn: () => patientsApi.list({ doctor_scope: 'mine', search: search.trim() || undefined, page_size: PAGE_SIZE }),
  });
  const columns = [
    { key: 'mrn', label: 'MRN', sortable: true, render: (row) => row.mrn || '—' },
    { key: 'name', label: 'Patient', sortable: true, render: (row) => <PatientLink patientId={row.id}><strong>{row.name}</strong></PatientLink> },
    { key: 'dateOfBirth', label: 'Age / Gender', render: (row) => `${Format.age(row.dateOfBirth) ?? '—'} / ${row.gender || '—'}` },
    { key: 'bloodGroup', label: 'Blood Group', render: (row) => row.bloodGroup || '—' },
    { key: 'chronicConditions', label: 'Chronic Conditions', render: (row) => Array.isArray(row.chronicConditions) ? row.chronicConditions.join(', ') || '—' : row.chronicConditions || '—' },
    { key: 'actions', label: '', render: (row) => <Link className="btn btn--secondary btn--sm" to={`/shared/patient-profile?id=${encodeURIComponent(row.id)}`}>View Record</Link> },
  ];

  return (
    <div className="doctor-workspace">
      <PageHeader title="Patient Records" subtitle="Patients assigned to or seen by you" icon="icon-users" />
      <section className="glass card doctor-panel" style={{ padding: '1rem' }}>
        <label htmlFor="doctor-patient-search" className="form-group__label">Search patients</label>
        <input id="doctor-patient-search" className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, MRN or phone" />
        {query.isLoading ? <LoadingState message="Loading patient records..." /> : query.error
          ? <ErrorState title="Unable to load patients" error={query.error} onRetry={query.refetch} />
          : <DataTable columns={columns} data={rowsFrom(query.data)} emptyTitle="No patients found" emptyMessage="No authorized patient records match this search." />}
      </section>
    </div>
  );
}

export function DoctorConsultationPage() {
  const doctorKey = useDoctorKey();
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get('appointmentId');
  const consultationId = searchParams.get('consultationId');
  const appointmentQuery = useQuery({
    queryKey: ['doctorConsultationAppointment', doctorKey, appointmentId],
    queryFn: () => appointmentsApi.get(appointmentId),
    enabled: Boolean(appointmentId),
  });
  const consultationQuery = useQuery({
    queryKey: ['doctorConsultationRecord', doctorKey, consultationId],
    queryFn: () => consultationsApi.get(consultationId),
    enabled: Boolean(consultationId),
  });
  const patientId = appointmentQuery.data?.patientId || consultationQuery.data?.patientId;
  const patientQuery = useQuery({
    queryKey: ['doctorConsultationPatient', doctorKey, patientId],
    queryFn: () => patientsApi.get(patientId),
    enabled: Boolean(patientId),
  });
  const listQuery = useQuery({
    queryKey: ['doctorConsultationsForAppointment', doctorKey, patientId],
    queryFn: () => consultationsApi.list({ doctor: 'me', patient: patientId, page_size: PAGE_SIZE }),
    enabled: Boolean(patientId) && !consultationId,
  });
  const record = consultationQuery.data || rowsFrom(listQuery.data).find((item) => item.appointmentId === appointmentId);

  if (!appointmentId && !consultationId) {
    return <ErrorState title="Select an appointment or consultation" error="Open a consultation from your appointment list." />;
  }
  if ((appointmentId && appointmentQuery.isLoading) || (consultationId && consultationQuery.isLoading) || (patientId && (patientQuery.isLoading || (!consultationId && listQuery.isLoading)))) {
    return <LoadingState message="Loading consultation record..." />;
  }
  if (appointmentQuery.error || consultationQuery.error || patientQuery.error || listQuery.error) {
    const query = appointmentQuery.error ? appointmentQuery : consultationQuery.error ? consultationQuery : patientQuery.error ? patientQuery : listQuery;
    return <ErrorState title="Unable to load consultation record" error={query.error} onRetry={query.refetch} />;
  }
  const patient = patientQuery.data || record?.patient || null;

  return (
    <div className="doctor-workspace">
      <PageHeader title="Consultation Record" subtitle="Authorized clinical record details" icon="icon-clipboard-list">
        {patientId && <Link className="btn btn--secondary btn--sm" to={`/shared/patient-profile?id=${encodeURIComponent(patientId)}`}>Patient Profile</Link>}
      </PageHeader>
      {patient?.allergies?.length > 0 && <div className="glass card" role="alert" style={{ padding: '1rem', marginBottom: '1rem', borderColor: 'var(--danger)' }}><strong>Allergies:</strong> {patient.allergies.join(', ')}</div>}
      {record ? (
        <section className="glass card doctor-panel" style={{ padding: '1.5rem' }}>
          <h2 className="text-card-title">{record.patientName || patient?.name || 'Patient'} · {formatDate(record.visitDate)}</h2>
          <p><strong>Diagnosis:</strong> {record.diagnosis || 'Not recorded'}</p>
          <p><strong>Symptoms:</strong> {record.symptoms || 'Not recorded'}</p>
          <p><strong>Notes:</strong> {record.notes || 'Not recorded'}</p>
          <p><strong>Vital signs:</strong> {record.vitalSigns && Object.keys(record.vitalSigns).length ? JSON.stringify(record.vitalSigns) : 'Not recorded'}</p>
          <p><strong>Status:</strong> {record.isCompleted ? 'Completed and locked' : 'Draft'}</p>
          {Array.isArray(record.addendums) && record.addendums.length > 0 && <div><h3 className="text-card-title">Addenda</h3>{record.addendums.map((entry, index) => <p key={`${entry.createdAt || 'entry'}-${index}`}>{entry.text} <small>{formatDateTime(entry.createdAt)}</small></p>)}</div>}
        </section>
      ) : (
        <EmptyState title="No consultation record yet" description="This appointment does not have a saved consultation record." icon="icon-clipboard-list" />
      )}
    </div>
  );
}

export function DoctorPrescriptionsPage() {
  const doctorKey = useDoctorKey();
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['doctorPrescriptions', doctorKey, status],
    queryFn: () => prescriptionsApi.list({ doctor: 'me', status: status || undefined, page_size: PAGE_SIZE }),
  });
  const columns = [
    { key: 'dateIssued', label: 'Date', sortable: true, render: (row) => formatDate(row.dateIssued || row.createdAt) },
    { key: 'patientName', label: 'Patient', sortable: true, render: (row) => <PatientLink patientId={row.patientId}>{row.patientName || 'Patient'}</PatientLink> },
    { key: 'items', label: 'Medicines', render: (row) => (row.items || []).map((item) => `${item.medicineName || item.medicineId}${item.dosage ? ` · ${item.dosage}` : ''}`).join(', ') || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'notes', label: 'Notes', render: (row) => row.notes || '—' },
  ];

  return (
    <div className="doctor-workspace">
      <PageHeader title="Prescription Management" subtitle="Prescriptions issued by you" icon="icon-clipboard-list" />
      <section className="glass card doctor-panel" style={{ padding: '1rem' }}>
        <label htmlFor="doctor-prescription-status" className="form-group__label">Filter by status</label>
        <select id="doctor-prescription-status" className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option><option value="PENDING">Pending</option><option value="PARTIALLY_DISPENSED">Partially dispensed</option><option value="DISPENSED">Dispensed</option><option value="CANCELLED">Cancelled</option>
        </select>
        {query.isLoading ? <LoadingState message="Loading prescriptions..." /> : query.error
          ? <ErrorState title="Unable to load prescriptions" error={query.error} onRetry={query.refetch} />
          : <DataTable columns={columns} data={rowsFrom(query.data)} showSearch searchPlaceholder="Search prescriptions..." emptyTitle="No prescriptions found" />}
      </section>
    </div>
  );
}

export function DoctorLabOrdersPage() {
  const doctorKey = useDoctorKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({ patientId: '', testId: '', priority: 'Routine', notes: '' });
  const query = useQuery({
    queryKey: ['doctorLabOrders', doctorKey, status],
    queryFn: () => labOrdersApi.list({ doctor: 'me', status: status || undefined, page_size: PAGE_SIZE }),
  });
  const patientsQuery = useQuery({
    queryKey: ['doctorLabOrderPatients', doctorKey],
    queryFn: () => patientsApi.list({ doctor_scope: 'mine', page_size: PAGE_SIZE }),
  });
  const catalogQuery = useQuery({
    queryKey: ['doctorLabCatalog'],
    queryFn: () => labCatalogApi.list({ page_size: PAGE_SIZE }),
  });
  const createOrderMutation = useMutation({
    mutationFn: (data) => labOrdersApi.create(data),
    onSuccess: (order) => {
      toast.success(`Lab order sent to the laboratory. Bill generated for ${order.testName}.`);
      setIsOrderModalOpen(false);
      setOrderForm({ patientId: '', testId: '', priority: 'Routine', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['doctorLabOrders'] });
      queryClient.invalidateQueries({ queryKey: ['labOrders'] });
      queryClient.invalidateQueries({ queryKey: ['labDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['labBills'] });
      queryClient.invalidateQueries({ queryKey: ['doctorDashboard'] });
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Unable to create the laboratory order.'),
  });
  const patients = rowsFrom(patientsQuery.data);
  const catalog = rowsFrom(catalogQuery.data).filter((test) => test.isActive !== false);
  const selectedTest = catalog.find((test) => test.id === orderForm.testId);
  const submitLabOrder = (event) => {
    event.preventDefault();
    createOrderMutation.mutate({
      patientId: orderForm.patientId,
      testId: orderForm.testId,
      priority: orderForm.priority,
      notes: orderForm.notes.trim(),
    });
  };
  const columns = [
    { key: 'orderedDate', label: 'Date', sortable: true, render: (row) => formatDate(row.orderedDate) },
    { key: 'patientName', label: 'Patient', sortable: true, render: (row) => <PatientLink patientId={row.patientId}>{row.patientName || 'Patient'}</PatientLink> },
    { key: 'testName', label: 'Test', sortable: true },
    { key: 'priority', label: 'Priority', render: (row) => <Badge status={row.priority} /> },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'isCritical', label: 'Result', render: (row) => row.results ? <details><summary>{row.isCritical ? 'Critical result' : 'View result'}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.results, null, 2)}</pre></details> : 'Awaiting result' },
  ];

  return (
    <div className="doctor-workspace">
      <PageHeader title="Diagnostic Lab Orders" subtitle="Your orders, processing state and reported results" icon="icon-flask">
        <button type="button" className="btn btn--primary" onClick={() => setIsOrderModalOpen(true)}>
          <Icon name="icon-flask" size={16} />
          <span>Order lab test</span>
        </button>
      </PageHeader>
      <section className="glass card doctor-panel" style={{ padding: '1rem' }}>
        <label htmlFor="doctor-lab-status" className="form-group__label">Filter by status</label>
        <select id="doctor-lab-status" className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option><option value="ORDERED">Ordered</option><option value="SAMPLE_COLLECTED">Sample collected</option><option value="PROCESSING">Processing</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
        </select>
        {query.isLoading ? <LoadingState message="Loading lab orders..." /> : query.error
          ? <ErrorState title="Unable to load lab orders" error={query.error} onRetry={query.refetch} />
          : <DataTable columns={columns} data={rowsFrom(query.data)} showSearch searchPlaceholder="Search lab orders..." emptyTitle="No lab orders found" />}
      </section>
      {isOrderModalOpen && <Modal isOpen onClose={() => { if (!createOrderMutation.isPending) setIsOrderModalOpen(false); }} title="Order a laboratory test">
        {patientsQuery.error
          ? <ErrorState title="Unable to load your patients" error={patientsQuery.error} onRetry={patientsQuery.refetch} />
          : catalogQuery.error
            ? <ErrorState title="Unable to load the test catalog" error={catalogQuery.error} onRetry={catalogQuery.refetch} />
            : patientsQuery.isLoading || catalogQuery.isLoading
              ? <LoadingState message="Loading patients and laboratory tests..." />
              : <form onSubmit={submitLabOrder}>
                <div className="form-group">
                  <label className="form-group__label" htmlFor="lab-order-patient">Patient</label>
                  <select id="lab-order-patient" className="form-control" value={orderForm.patientId} onChange={(event) => setOrderForm((current) => ({ ...current, patientId: event.target.value }))} required>
                    <option value="">Choose a patient</option>
                    {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}{patient.mrn ? ` (${patient.mrn})` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-group__label" htmlFor="lab-order-test">Laboratory test</label>
                  <select id="lab-order-test" className="form-control" value={orderForm.testId} onChange={(event) => setOrderForm((current) => ({ ...current, testId: event.target.value }))} required>
                    <option value="">Choose a test</option>
                    {catalog.map((test) => <option key={test.id} value={test.id}>{test.name || test.testName} · {Format.money(test.price)}</option>)}
                  </select>
                  {selectedTest && <small>Test price: {Format.money(selectedTest.price)}</small>}
                </div>
                <div className="form-group">
                  <label className="form-group__label" htmlFor="lab-order-priority">Priority</label>
                  <select id="lab-order-priority" className="form-control" value={orderForm.priority} onChange={(event) => setOrderForm((current) => ({ ...current, priority: event.target.value }))}>
                    <option value="Routine">Routine</option><option value="Urgent">Urgent</option><option value="STAT">STAT</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-group__label" htmlFor="lab-order-notes">Clinical notes (optional)</label>
                  <textarea id="lab-order-notes" className="form-control" rows={3} value={orderForm.notes} onChange={(event) => setOrderForm((current) => ({ ...current, notes: event.target.value }))} />
                </div>
                {patients.length === 0 && <p>No patients are currently assigned to or seen by your account.</p>}
                {catalog.length === 0 && <p>No active laboratory tests are available in the catalog.</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn--secondary" onClick={() => setIsOrderModalOpen(false)} disabled={createOrderMutation.isPending}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={createOrderMutation.isPending || patients.length === 0 || catalog.length === 0}>
                    {createOrderMutation.isPending ? 'Sending order…' : 'Send order'}
                  </button>
                </div>
              </form>}
      </Modal>}
    </div>
  );
}

export function DoctorClinicalHistoryPage() {
  const doctorKey = useDoctorKey();
  const [patientId, setPatientId] = useState('');
  const patientsQuery = useQuery({
    queryKey: ['doctorHistoryPatients', doctorKey],
    queryFn: () => patientsApi.list({ doctor_scope: 'mine', page_size: PAGE_SIZE }),
  });
  const historyQuery = useQuery({
    queryKey: ['doctorClinicalHistory', doctorKey, patientId],
    queryFn: () => patientsApi.clinicalHistory(patientId),
    enabled: Boolean(patientId),
  });
  const patients = rowsFrom(patientsQuery.data);
  const history = historyQuery.data || {};
  const timeline = [
    ...(history.consultations || []).map((entry) => ({ id: `consult-${entry.record_id}`, date: entry.visit_date, kind: 'Consultation', detail: entry.diagnosis || entry.symptoms || 'Clinical record', status: entry.doctor__staff__name || '' })),
    ...(history.prescriptions || []).map((entry) => ({ id: `rx-${entry.prescription_id}`, date: entry.created_at, kind: 'Prescription', detail: entry.prescription_id, status: entry.status })),
    ...(history.labOrders || []).map((entry) => ({ id: `lab-${entry.test_id}`, date: entry.ordered_date, kind: 'Lab order', detail: entry.test_catalog__test_name, status: entry.status })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const columns = [
    { key: 'date', label: 'Date', sortable: true, render: (row) => formatDateTime(row.date) },
    { key: 'kind', label: 'Record Type', sortable: true },
    { key: 'detail', label: 'Details', sortable: true },
    { key: 'status', label: 'Status / Clinician', render: (row) => row.status || '—' },
  ];

  return (
    <div className="doctor-workspace">
      <PageHeader title="Clinical History & Timeline" subtitle="Authorized longitudinal records for your patients" icon="icon-history" />
      {patientsQuery.error ? <ErrorState title="Unable to load your patients" error={patientsQuery.error} onRetry={patientsQuery.refetch} /> : patientsQuery.isLoading
        ? <LoadingState message="Loading your patients..." />
        : <section className="glass card doctor-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <label htmlFor="history-patient" className="form-group__label">Patient</label>
          <select id="history-patient" className="form-control" value={patientId} onChange={(event) => setPatientId(event.target.value)}>
            <option value="">Choose a patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} {patient.mrn ? `(${patient.mrn})` : ''}</option>)}
          </select>
        </section>}
      {patientId && (historyQuery.isLoading ? <LoadingState message="Loading clinical history..." /> : historyQuery.error
        ? <ErrorState title="Unable to load clinical history" error={historyQuery.error} onRetry={historyQuery.refetch} />
        : <section className="glass card doctor-panel" style={{ padding: '1rem' }}>
          <h2 className="text-card-title">{history.patientName || 'Clinical Timeline'}</h2>
          <DataTable columns={columns} data={timeline} showSearch searchPlaceholder="Search clinical history..." emptyTitle="No clinical history found" />
        </section>)}
      {!patientId && !patientsQuery.isLoading && !patientsQuery.error && patients.length === 0 && <EmptyState title="No patients available" description="No patients are currently assigned to or seen by your account." icon="icon-users" />}
    </div>
  );
}
