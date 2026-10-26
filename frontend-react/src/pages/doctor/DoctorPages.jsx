import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi, consultationsApi, labCatalogApi, labOrdersApi, labResultsApi, medicinesApi, patientsApi, prescriptionsApi } from '../../api/resources';
import { useAuth } from '../../auth/AuthContext';
import Badge from '../../components/Badge';
import Icon from '../../components/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { DataTable, Modal, useToast } from '../../components/ui';
import { Format, formatDate, formatDateTime, formatTime } from '../../utils/format';
import { clinicDateString } from '../../utils/clinicDate';
import './doctor-pages.css';

const PAGE_SIZE = 200;
const today = clinicDateString();

function rowsFrom(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
}

function backendErrorMessage(error, fallback) {
  const body = error?.response?.data;
  if (typeof body?.detail === 'string') return body.detail;
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const messages = Object.entries(body).flatMap(([field, value]) => {
      if (typeof value === 'string') return [`${field}: ${value}`];
      if (Array.isArray(value)) return [`${field}: ${value.filter((item) => typeof item === 'string').join(' ')}`];
      return [];
    }).filter((message) => !message.endsWith(': '));
    if (messages.length) return messages.join(' ');
  }
  return fallback;
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

const RESULT_FIELDS = {
  parameter: ['parameter', 'parameterName', 'name', 'label'],
  value: ['value', 'result', 'resultValue'],
  unit: ['unit', 'units'],
  flag: ['flag', 'abnormalFlag'],
};
const RESULT_CORE_KEYS = new Set(Object.values(RESULT_FIELDS).flat().map((key) => key.toLowerCase()).concat('status'));

function isResultRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readableResultLabel(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayResultValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(displayResultValue).join(', ');
  if (isResultRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${readableResultLabel(key)}: ${displayResultValue(item)}`)
      .join('; ');
  }
  return String(value);
}

function findResultField(row, aliases) {
  const entries = Object.entries(row);
  const normalizedAliases = aliases.map((key) => key.toLowerCase());
  const match = entries.find(([key]) => normalizedAliases.includes(key.toLowerCase()));
  return match ? { present: true, value: match[1] } : { present: false, value: undefined };
}

function normalizeLabResult(value) {
  if (value === null || value === undefined) return { type: 'empty' };
  if (typeof value === 'string') {
    return value.trim() ? { type: 'text', text: value } : { type: 'empty' };
  }
  if (Array.isArray(value)) {
    if (!value.length) return { type: 'empty' };
    if (value.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return { type: 'text', text: value.map(String).join('\n') };
    }
    return {
      type: 'table',
      rows: value.map((item, index) => isResultRecord(item) ? item : { parameter: `Result ${index + 1}`, value: item }),
    };
  }
  if (isResultRecord(value)) {
    const hasStructuredFields = Object.values(RESULT_FIELDS).flat().some((key) => Object.keys(value).some((actual) => actual.toLowerCase() === key.toLowerCase()))
      || Object.keys(value).some((key) => key.toLowerCase() === 'status');
    if (hasStructuredFields) return { type: 'table', rows: [value] };
    const entries = Object.entries(value);
    if (!entries.length) return { type: 'empty' };
    return {
      type: 'table',
      rows: entries.map(([parameter, result]) => isResultRecord(result)
        ? { ...result, parameter }
        : { parameter, value: result }),
    };
  }
  if (typeof value === 'number' || typeof value === 'boolean') return { type: 'text', text: String(value) };
  return { type: 'unsupported' };
}

function resultFlag(value) {
  if (value === null || value === undefined || !String(value).trim()) {
    return { label: 'Not provided', variant: 'neutral' };
  }
  const raw = String(value).trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'normal') return { label: 'Normal', variant: 'success' };
  if (normalized === 'high') return { label: 'High', variant: 'warning' };
  if (normalized === 'low') return { label: 'Low', variant: 'warning' };
  if (normalized.startsWith('critical')) return { label: readableResultLabel(raw), variant: 'danger' };
  return { label: readableResultLabel(raw), variant: 'neutral' };
}

function ResultTable({ rows }) {
  const extraKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !RESULT_CORE_KEYS.has(key.toLowerCase()));
  return (
    <div className="doctor-lab-results-table-wrap">
      <table className="data-table doctor-lab-results-table" aria-label="Laboratory result values">
        <thead><tr>
          <th scope="col">Parameter</th><th scope="col">Result</th><th scope="col">Unit</th><th scope="col">Flag</th>
          {extraKeys.map((key) => <th scope="col" key={key}>{readableResultLabel(key)}</th>)}
        </tr></thead>
        <tbody>{rows.map((row, index) => {
          const parameter = findResultField(row, RESULT_FIELDS.parameter);
          const result = findResultField(row, RESULT_FIELDS.value);
          const unit = findResultField(row, RESULT_FIELDS.unit);
          const flag = findResultField(row, RESULT_FIELDS.flag);
          const status = flag.present ? flag.value : findResultField(row, ['status']).value;
          const flagView = resultFlag(status);
          return (
            <tr key={`${displayResultValue(parameter.value)}-${index}`}>
              <td>{parameter.present ? displayResultValue(parameter.value) : `Result ${index + 1}`}</td>
              <td>{result.present ? displayResultValue(result.value) : '—'}</td>
              <td>{unit.present ? displayResultValue(unit.value) : '—'}</td>
              <td><Badge variant={flagView.variant}>{flagView.label}</Badge></td>
              {extraKeys.map((key) => <td key={key}>{Object.hasOwn(row, key) ? displayResultValue(row[key]) : '—'}</td>)}
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function LabResultContent({ result }) {
  const normalized = normalizeLabResult(result);
  if (normalized.type === 'empty') return <p className="doctor-lab-result-empty">No result values were recorded for this report.</p>;
  if (normalized.type === 'text') return <div className="doctor-lab-result-text">{normalized.text}</div>;
  if (normalized.type === 'table') return <ResultTable rows={normalized.rows} />;
  return <p className="doctor-lab-result-empty">This result format cannot be displayed.</p>;
}

function ReportField({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return <div className="doctor-lab-report-field"><dt>{label}</dt><dd>{children}</dd></div>;
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
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeAppointmentId = searchParams.get('appointmentId');
  const consultationId = searchParams.get('consultationId');
  const consultationQuery = useQuery({
    queryKey: ['doctorConsultationRecord', doctorKey, consultationId],
    queryFn: () => consultationsApi.get(consultationId),
    enabled: Boolean(consultationId),
  });
  const appointmentId = routeAppointmentId || consultationQuery.data?.appointmentId;
  const appointmentQuery = useQuery({
    queryKey: ['doctorConsultationAppointment', doctorKey, appointmentId],
    queryFn: () => appointmentsApi.get(appointmentId),
    enabled: Boolean(appointmentId),
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
  const medicinesQuery = useQuery({
    queryKey: ['doctorMedicineCatalogue'],
    queryFn: () => medicinesApi.list({ is_active: true, page_size: PAGE_SIZE }),
    enabled: Boolean(record),
  });
  const medicines = rowsFrom(medicinesQuery.data).filter((medicine) => medicine.isActive !== false);
  const [drafts, setDrafts] = useState({});
  const [prescriptionItems, setPrescriptionItems] = useState([{ medicineId: '', dosage: '', frequency: '', durationDays: '', instructions: '' }]);
  const [explicitOverride, setExplicitOverride] = useState(false);
  const draft = record ? drafts[record.id] || {
    symptoms: record.symptoms || '',
    diagnosis: record.diagnosis || '',
    notes: record.notes || '',
    vitalSigns: record.vitalSigns && Object.keys(record.vitalSigns).length ? JSON.stringify(record.vitalSigns, null, 2) : '',
  } : null;
  const updateDraft = (field, value) => setDrafts((current) => ({
    ...current,
    [record.id]: { ...(current[record.id] || draft), [field]: value },
  }));
  const storeRecord = (updated) => {
    queryClient.setQueryData(['doctorConsultationRecord', doctorKey, updated.id], updated);
    queryClient.invalidateQueries({ queryKey: ['doctorConsultationsForAppointment', doctorKey] });
    queryClient.invalidateQueries({ queryKey: ['doctorConsultationAppointment', doctorKey, appointmentId] });
    setDrafts((current) => {
      const next = { ...current };
      delete next[updated.id];
      return next;
    });
  };
  const startMutation = useMutation({
    mutationFn: () => consultationsApi.getOrCreate({ appointmentId }),
    onSuccess: (created) => {
      queryClient.setQueryData(['doctorConsultationRecord', doctorKey, created.id], created);
      queryClient.invalidateQueries({ queryKey: ['doctorConsultationAppointment', doctorKey, appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['doctorAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['doctorAppointmentsToday'] });
      navigate(`/doctor/consultation?appointmentId=${encodeURIComponent(appointmentId)}&consultationId=${encodeURIComponent(created.id)}`, { replace: true });
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Unable to start the consultation.'),
  });
  const clinicalPayload = () => {
    let vitalSigns = {};
    if (draft.vitalSigns.trim()) {
      try {
        vitalSigns = JSON.parse(draft.vitalSigns);
        if (!vitalSigns || typeof vitalSigns !== 'object' || Array.isArray(vitalSigns)) throw new Error('invalid');
      } catch {
        toast.error('Vital signs must be a valid JSON object.');
        return null;
      }
    }
    return { symptoms: draft.symptoms, diagnosis: draft.diagnosis, notes: draft.notes, vitalSigns };
  };
  const saveMutation = useMutation({
    mutationFn: (payload) => consultationsApi.saveDraft(record.id, payload),
    onSuccess: (updated) => { storeRecord(updated); toast.success('Consultation draft saved.'); },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Unable to save the consultation.'),
  });
  const completeMutation = useMutation({
    mutationFn: (payload) => consultationsApi.complete(record.id, payload),
    onSuccess: (updated) => { storeRecord(updated); toast.success('Consultation completed.'); },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Unable to complete the consultation.'),
  });
  const prescriptionMutation = useMutation({
    mutationFn: (payload) => prescriptionsApi.create(payload),
    onSuccess: () => {
      toast.success('Prescription sent to Pharmacy.');
      setPrescriptionItems([{ medicineId: '', dosage: '', frequency: '', durationDays: '', instructions: '' }]);
      setExplicitOverride(false);
      queryClient.invalidateQueries({ queryKey: ['doctorPrescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyPrescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyDashboard'] });
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Unable to save the prescription.'),
  });

  if (!routeAppointmentId && !consultationId) {
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
  const eligibleToStart = ['CHECKED_IN', 'IN_PROGRESS'].includes(appointmentQuery.data?.status);
  const saveClinicalDraft = (event) => {
    event.preventDefault();
    const payload = clinicalPayload();
    if (payload) saveMutation.mutate(payload);
  };
  const completeClinicalRecord = () => {
    const payload = clinicalPayload();
    if (payload) completeMutation.mutate(payload);
  };
  const submitPrescription = (event) => {
    event.preventDefault();
    if (prescriptionItems.some((item) => !item.medicineId || !Number.isInteger(Number(item.durationDays)) || Number(item.durationDays) < 1)) {
      toast.error('Choose a medicine and enter a duration in whole days for every item.');
      return;
    }
    prescriptionMutation.mutate({
      patientId: record.patientId,
      doctorId: record.doctorId,
      consultationId: record.id,
      explicitOverride,
      items: prescriptionItems.map((item) => ({
        medicineId: item.medicineId,
        dosage: item.dosage.trim(),
        frequency: item.frequency.trim(),
        durationDays: Number(item.durationDays),
        instructions: item.instructions.trim(),
      })),
    });
  };

  return (
    <div className="doctor-workspace">
      <PageHeader title="Consultation Record" subtitle="Authorized clinical record details" icon="icon-clipboard-list">
        {patientId && <Link className="btn btn--secondary btn--sm" to={`/shared/patient-profile?id=${encodeURIComponent(patientId)}`}>Patient Profile</Link>}
      </PageHeader>
      {patient?.allergies?.length > 0 && <div className="glass card" role="alert" style={{ padding: '1rem', marginBottom: '1rem', borderColor: 'var(--danger)' }}><strong>Allergies:</strong> {patient.allergies.join(', ')}</div>}
      {appointmentQuery.data && <section className="glass card doctor-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <p><strong>Appointment:</strong> {patient?.name || appointmentQuery.data.patientName} · {formatDate(appointmentQuery.data.date)} at {formatTime(appointmentQuery.data.time)}</p>
        <p><strong>Status:</strong> <Badge status={appointmentQuery.data.status} /></p>
        {!record && eligibleToStart && <button type="button" className="btn btn--primary" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>{startMutation.isPending ? 'Starting…' : 'Start consultation'}</button>}
        {!record && !eligibleToStart && <p role="status">Reception check-in is required before the consultation can start.</p>}
      </section>}
      {record ? (
        <>
          <section className="glass card doctor-panel" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
            <h2 className="text-card-title">{record.patientName || patient?.name || 'Patient'} · {formatDate(record.visitDate)}</h2>
            {record.isCompleted ? <>
              <p><strong>Diagnosis:</strong> {record.diagnosis || 'Not recorded'}</p>
              <p><strong>Symptoms:</strong> {record.symptoms || 'Not recorded'}</p>
              <p><strong>Notes:</strong> {record.notes || 'Not recorded'}</p>
              <p><strong>Vital signs:</strong> {record.vitalSigns && Object.keys(record.vitalSigns).length ? JSON.stringify(record.vitalSigns) : 'Not recorded'}</p>
              <p><strong>Status:</strong> Completed and locked</p>
            </> : <form onSubmit={saveClinicalDraft} className="doctor-consultation-form">
              <label className="form-group__label" htmlFor="consult-symptoms">Symptoms</label>
              <textarea id="consult-symptoms" className="form-control" value={draft.symptoms} onChange={(event) => updateDraft('symptoms', event.target.value)} rows={3} />
              <label className="form-group__label" htmlFor="consult-diagnosis">Diagnosis</label>
              <textarea id="consult-diagnosis" className="form-control" value={draft.diagnosis} onChange={(event) => updateDraft('diagnosis', event.target.value)} rows={2} />
              <label className="form-group__label" htmlFor="consult-notes">Clinical notes</label>
              <textarea id="consult-notes" className="form-control" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} rows={4} />
              <label className="form-group__label" htmlFor="consult-vitals">Vital Signs (Optional)</label>
              <textarea id="consult-vitals" className="form-control" value={draft.vitalSigns} onChange={(event) => updateDraft('vitalSigns', event.target.value)} rows={2} />
              <div className="doctor-consultation-actions">
                <button type="submit" className="btn btn--secondary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save draft'}</button>
                <button type="button" className="btn btn--primary" onClick={completeClinicalRecord} disabled={saveMutation.isPending || completeMutation.isPending}>{completeMutation.isPending ? 'Completing…' : 'Complete consultation'}</button>
              </div>
            </form>}
            {Array.isArray(record.addendums) && record.addendums.length > 0 && <div><h3 className="text-card-title">Addenda</h3>{record.addendums.map((entry, index) => <p key={`${entry.createdAt || 'entry'}-${index}`}>{entry.text} <small>{formatDateTime(entry.createdAt)}</small></p>)}</div>}
          </section>
          <section className="glass card doctor-panel" style={{ padding: '1.5rem' }}>
            <h2 className="text-card-title">Prescribe medicines</h2>
            {medicinesQuery.error ? <ErrorState title="Unable to load medicines" error={medicinesQuery.error} onRetry={medicinesQuery.refetch} /> : medicinesQuery.isLoading
              ? <LoadingState message="Loading medicine catalogue…" />
              : medicines.length === 0 ? <p>No active medicines are available.</p> : <form onSubmit={submitPrescription}>
                {prescriptionItems.map((item, index) => <div className="doctor-prescription-item" key={`prescription-item-${index}`}>
                  <label className="form-group__label" htmlFor={`rx-medicine-${index}`}>Medicine</label>
                  <select id={`rx-medicine-${index}`} className="form-control" value={item.medicineId} onChange={(event) => setPrescriptionItems((current) => current.map((value, row) => row === index ? { ...value, medicineId: event.target.value } : value))} required>
                    <option value="">Choose a medicine</option>{medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name}{medicine.strength ? ` · ${medicine.strength}` : ''}</option>)}
                  </select>
                  <div className="doctor-prescription-item__grid">
                    <label className="form-group__label">Dosage<input className="form-control" value={item.dosage} onChange={(event) => setPrescriptionItems((current) => current.map((value, row) => row === index ? { ...value, dosage: event.target.value } : value))} placeholder="e.g. 1 tablet" /></label>
                    <label className="form-group__label">Frequency<input className="form-control" value={item.frequency} onChange={(event) => setPrescriptionItems((current) => current.map((value, row) => row === index ? { ...value, frequency: event.target.value } : value))} placeholder="e.g. Twice daily" /></label>
                    <label className="form-group__label">Duration (days)<input className="form-control" type="number" min="1" step="1" value={item.durationDays} onChange={(event) => setPrescriptionItems((current) => current.map((value, row) => row === index ? { ...value, durationDays: event.target.value } : value))} required /></label>
                  </div>
                  <label className="form-group__label">Instructions<textarea className="form-control" value={item.instructions} onChange={(event) => setPrescriptionItems((current) => current.map((value, row) => row === index ? { ...value, instructions: event.target.value } : value))} rows={2} /></label>
                  {prescriptionItems.length > 1 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPrescriptionItems((current) => current.filter((_, row) => row !== index))}>Remove medicine</button>}
                </div>)}
                <div className="doctor-consultation-actions">
                  <button type="button" className="btn btn--secondary" onClick={() => setPrescriptionItems((current) => [...current, { medicineId: '', dosage: '', frequency: '', durationDays: '', instructions: '' }])}>Add medicine</button>
                  {patient?.allergies?.length > 0 && <label><input type="checkbox" checked={explicitOverride} onChange={(event) => setExplicitOverride(event.target.checked)} /> Override allergy warning</label>}
                  <button type="submit" className="btn btn--primary" disabled={prescriptionMutation.isPending}>{prescriptionMutation.isPending ? 'Sending…' : 'Send prescription to Pharmacy'}</button>
                </div>
              </form>}
          </section>
        </>
      ) : !appointmentQuery.data ? <EmptyState title="No consultation record yet" description="A checked-in appointment is required before a consultation can start." icon="icon-clipboard-list" /> : null}
    </div>
  );
}

export function DoctorPrescriptionsPage() {
  const doctorKey = useDoctorKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    patientId: '',
    items: [{ medicineId: '', dosage: '', frequency: '', durationDays: '', instructions: '' }],
    notes: '',
    explicitOverride: false,
  });
  const query = useQuery({
    queryKey: ['doctorPrescriptions', doctorKey, status],
    queryFn: () => prescriptionsApi.list({ doctor: 'me', status: status || undefined, page_size: PAGE_SIZE }),
  });
  const patientsQuery = useQuery({
    queryKey: ['doctorPrescriptionPatients', doctorKey, patientSearch.trim()],
    queryFn: () => patientsApi.list({
      doctor_scope: 'mine',
      is_active: true,
      search: patientSearch.trim() || undefined,
      page_size: PAGE_SIZE,
    }),
    enabled: isCreateModalOpen,
  });
  const medicinesQuery = useQuery({
    queryKey: ['doctorMedicineCatalogue'],
    queryFn: () => medicinesApi.list({ is_active: true, page_size: PAGE_SIZE }),
    enabled: isCreateModalOpen,
  });
  const patients = rowsFrom(patientsQuery.data);
  const medicines = rowsFrom(medicinesQuery.data).filter((medicine) => medicine.isActive !== false);
  const resetCreateForm = () => {
    setCreateForm({
      patientId: '',
      items: [{ medicineId: '', dosage: '', frequency: '', durationDays: '', instructions: '' }],
      notes: '',
      explicitOverride: false,
    });
    setPatientSearch('');
    setCreateError('');
  };
  const closeCreateModal = () => {
    if (createMutation.isPending) return;
    setIsCreateModalOpen(false);
    resetCreateForm();
  };
  const createMutation = useMutation({
    mutationFn: (payload) => prescriptionsApi.create(payload),
    onSuccess: (prescription) => {
      toast.success('Prescription created and sent to Pharmacy.');
      setIsCreateModalOpen(false);
      resetCreateForm();
      queryClient.invalidateQueries({ queryKey: ['doctorPrescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyPrescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['pharmacyDashboard'] });
      if (prescription?.patientId) {
        queryClient.invalidateQueries({ queryKey: ['doctorPatientHistory', prescription.patientId] });
      }
    },
    onError: (error) => {
      const message = backendErrorMessage(error, 'Unable to create the prescription. Review the form and try again.');
      setCreateError(message);
      toast.error(message);
    },
  });
  const updatePrescriptionItem = (index, field, value) => {
    setCreateForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };
  const submitPrescription = (event) => {
    event.preventDefault();
    if (!createForm.patientId || createForm.items.length === 0) {
      setCreateError('Select a patient and add at least one medicine.');
      return;
    }
    if (createForm.items.some((item) => (
      !item.medicineId || !Number.isInteger(Number(item.durationDays)) || Number(item.durationDays) < 1
    ))) {
      setCreateError('Choose a medicine and enter a positive whole number of days for every item.');
      return;
    }
    setCreateError('');
    createMutation.mutate({
      patientId: createForm.patientId,
      explicitOverride: createForm.explicitOverride,
      notes: createForm.notes.trim(),
      items: createForm.items.map((item) => ({
        medicineId: item.medicineId,
        dosage: item.dosage.trim(),
        frequency: item.frequency.trim(),
        durationDays: Number(item.durationDays),
        instructions: item.instructions.trim(),
      })),
    });
  };
  const columns = [
    { key: 'dateIssued', label: 'Date', sortable: true, render: (row) => formatDate(row.dateIssued || row.createdAt) },
    { key: 'patientName', label: 'Patient', sortable: true, render: (row) => <PatientLink patientId={row.patientId}>{row.patientName || 'Patient'}</PatientLink> },
    { key: 'items', label: 'Medicines', render: (row) => (row.items || []).map((item) => [item.medicineName || item.medicineId, item.dosage, item.frequency, item.durationDays ? `${item.durationDays} days` : null].filter(Boolean).join(' · ')).join(', ') || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    { key: 'notes', label: 'Notes', render: (row) => row.notes || '—' },
  ];

  return (
    <div className="doctor-workspace">
      <PageHeader title="Prescription Management" subtitle="Prescriptions issued by you" icon="icon-clipboard-list">
        <button type="button" className="btn btn--primary" onClick={() => { resetCreateForm(); setIsCreateModalOpen(true); }}>
          <Icon name="icon-plus" size={16} />
          <span>Create Prescription</span>
        </button>
      </PageHeader>
      <section className="glass card doctor-panel" style={{ padding: '1rem' }}>
        <label htmlFor="doctor-prescription-status" className="form-group__label">Filter by status</label>
        <select id="doctor-prescription-status" className="form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option><option value="PENDING">Pending</option><option value="PARTIALLY_DISPENSED">Partially dispensed</option><option value="DISPENSED">Dispensed</option><option value="CANCELLED">Cancelled</option>
        </select>
        {query.isLoading ? <LoadingState message="Loading prescriptions..." /> : query.error
          ? <ErrorState title="Unable to load prescriptions" error={query.error} onRetry={query.refetch} />
          : <DataTable columns={columns} data={rowsFrom(query.data)} showSearch searchPlaceholder="Search prescriptions..." emptyTitle="No prescriptions found" />}
      </section>
      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Create Prescription"
        size="lg"
        trapFocus
      >
        {patientsQuery.isLoading || medicinesQuery.isLoading
          ? <LoadingState message="Loading your patients and medicine catalogue..." />
          : patientsQuery.error
            ? <ErrorState title="Unable to load your patients" error={patientsQuery.error} onRetry={patientsQuery.refetch} />
            : medicinesQuery.error
              ? <ErrorState title="Unable to load the medicine catalogue" error={medicinesQuery.error} onRetry={medicinesQuery.refetch} />
              : <form onSubmit={submitPrescription}>
                <div className="form-group">
                  <label className="form-group__label" htmlFor="prescription-patient-search">Find an authorized patient</label>
                  <input
                    id="prescription-patient-search"
                    className="form-control"
                    type="search"
                    value={patientSearch}
                    onChange={(event) => {
                      setPatientSearch(event.target.value);
                      setCreateForm((current) => ({ ...current, patientId: '' }));
                    }}
                    placeholder="Search by name, patient ID, MRN, or phone"
                    autoComplete="off"
                  />
                </div>
                {patientsQuery.isFetching && <LoadingState message="Searching patients..." />}
                <div className="form-group">
                  <label className="form-group__label" htmlFor="prescription-patient">Patient</label>
                  <select
                    id="prescription-patient"
                    className="form-control"
                    value={createForm.patientId}
                    onChange={(event) => setCreateForm((current) => ({ ...current, patientId: event.target.value }))}
                    required
                    disabled={patients.length === 0}
                  >
                    <option value="">Choose a patient</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} · {patient.id}{patient.mrn ? ` · MRN ${patient.mrn}` : ''}
                      </option>
                    ))}
                  </select>
                  {!patientsQuery.isFetching && patients.length === 0 && (
                    <EmptyState title="No matching patients" description="No active patients in your authorized patient list match this search." icon="icon-users" />
                  )}
                </div>
                {medicines.length === 0
                  ? <EmptyState title="No active medicines" description="No medicines are currently available in the catalogue." icon="icon-package" />
                  : <>
                    <h3 className="text-card-title">Medicine directions</h3>
                    {createForm.items.map((item, index) => (
                      <div className="doctor-prescription-item" key={`direct-rx-item-${index}`}>
                        <label className="form-group__label" htmlFor={`direct-rx-medicine-${index}`}>Medicine</label>
                        <select
                          id={`direct-rx-medicine-${index}`}
                          className="form-control"
                          value={item.medicineId}
                          onChange={(event) => updatePrescriptionItem(index, 'medicineId', event.target.value)}
                          required
                        >
                          <option value="">Choose a medicine</option>
                          {medicines.map((medicine) => (
                            <option key={medicine.id} value={medicine.id}>
                              {medicine.name}{medicine.strength ? ` · ${medicine.strength}` : ''}
                            </option>
                          ))}
                        </select>
                        <div className="doctor-prescription-item__grid">
                          <label className="form-group__label">Dosage
                            <input className="form-control" value={item.dosage} onChange={(event) => updatePrescriptionItem(index, 'dosage', event.target.value)} placeholder="e.g. 1 tablet" />
                          </label>
                          <label className="form-group__label">Frequency
                            <input className="form-control" value={item.frequency} onChange={(event) => updatePrescriptionItem(index, 'frequency', event.target.value)} placeholder="e.g. Twice daily" />
                          </label>
                          <label className="form-group__label">Duration (days)
                            <input className="form-control" type="number" min="1" step="1" value={item.durationDays} onChange={(event) => updatePrescriptionItem(index, 'durationDays', event.target.value)} required />
                          </label>
                        </div>
                        <label className="form-group__label">Additional instructions
                          <textarea className="form-control" value={item.instructions} onChange={(event) => updatePrescriptionItem(index, 'instructions', event.target.value)} rows={2} />
                        </label>
                        {createForm.items.length > 1 && (
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCreateForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>
                            Remove medicine
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setCreateForm((current) => ({
                        ...current,
                        items: [...current.items, { medicineId: '', dosage: '', frequency: '', durationDays: '', instructions: '' }],
                      }))}
                    >Add medicine</button>
                  </>}
                <label className="form-group__label" htmlFor="direct-rx-notes">Prescription notes (optional)</label>
                <textarea id="direct-rx-notes" className="form-control" value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} rows={2} />
                {patients.find((patient) => patient.id === createForm.patientId)?.allergies?.length > 0 && (
                  <label style={{ display: 'block', margin: '1rem 0' }}>
                    <input type="checkbox" checked={createForm.explicitOverride} onChange={(event) => setCreateForm((current) => ({ ...current, explicitOverride: event.target.checked }))} />
                    {' '}Override the patient's allergy warning
                  </label>
                )}
                {createError && <p role="alert" className="doctor-prescription-error">{createError}</p>}
                <div className="doctor-consultation-actions">
                  <button type="button" className="btn btn--secondary" onClick={closeCreateModal} disabled={createMutation.isPending}>Cancel</button>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={createMutation.isPending || patientsQuery.isFetching || medicines.length === 0}
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create and send to Pharmacy'}
                  </button>
                </div>
              </form>}
      </Modal>
    </div>
  );
}

export function DoctorLabOrdersPage() {
  const doctorKey = useDoctorKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedResultOrder, setSelectedResultOrder] = useState(null);
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
  const resultDetailsQuery = useQuery({
    queryKey: ['doctorLabResultDetails', doctorKey, selectedResultOrder?.id],
    queryFn: () => labResultsApi.list({ test: selectedResultOrder.id, page_size: 1 }),
    enabled: Boolean(selectedResultOrder?.id),
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
  const selectedLabResult = selectedResultOrder
    ? rowsFrom(resultDetailsQuery.data).find((result) => String(result.testId) === String(selectedResultOrder.id))
    : null;
  const displayedResult = selectedLabResult?.results ?? selectedResultOrder?.results;
  const hasSelectedResult = Boolean(selectedLabResult) || (displayedResult !== null && displayedResult !== undefined);
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
    { key: 'result', label: 'Result', render: (row) => row.results !== null && row.results !== undefined
      ? <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSelectedResultOrder(row)} aria-label={`View result for ${row.patientName || 'patient'} — ${row.testName || 'laboratory test'}`}>View result</button>
      : 'Awaiting result' },
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
      {selectedResultOrder && <Modal
        isOpen
        size="xl"
        title="Laboratory Report"
        trapFocus
        overlayClassName="doctor-lab-report-overlay"
        contentClassName="doctor-lab-report-modal"
        onClose={() => setSelectedResultOrder(null)}
      >
        <article className="doctor-lab-report">
          <header className="doctor-lab-report__brand">
            <div>
              <p className="doctor-lab-report__brand-name">Clinova Healthcare</p>
              <p className="doctor-lab-report__brand-caption">Clinical Management System</p>
            </div>
            <Icon name="icon-flask" size={28} />
          </header>
          {resultDetailsQuery.isLoading && <p className="doctor-lab-report__loading" role="status">Loading report details…</p>}
          {resultDetailsQuery.isError && <p className="doctor-lab-report__note" role="status">Some report details are unavailable. Showing the result returned with this order.</p>}
          <dl className="doctor-lab-report__details">
            <ReportField label="Patient">{selectedResultOrder.patientName || 'Not available'}</ReportField>
            <ReportField label="Patient ID">{selectedResultOrder.patientId}</ReportField>
            <ReportField label="MRN">{selectedResultOrder.patientMrn}</ReportField>
            <ReportField label="Laboratory test">{selectedResultOrder.testName || 'Not available'}</ReportField>
            <ReportField label="Test code">{selectedResultOrder.testCode}</ReportField>
            <ReportField label="Order date">{selectedResultOrder.orderedDate ? formatDate(selectedResultOrder.orderedDate) : 'Not available'}</ReportField>
            <ReportField label="Result date">{selectedLabResult?.resultDate ? formatDate(selectedLabResult.resultDate) : null}</ReportField>
            <ReportField label="Order status">{selectedResultOrder.status ? <Badge status={selectedResultOrder.status} /> : 'Not available'}</ReportField>
            <ReportField label="Result status">{(selectedLabResult?.isCritical ?? selectedResultOrder.isCritical)
              ? <Badge variant="danger">Critical</Badge>
              : hasSelectedResult ? 'Recorded' : 'Not available'}</ReportField>
            <ReportField label="Priority">{selectedResultOrder.priority ? <Badge status={selectedResultOrder.priority} /> : null}</ReportField>
            <ReportField label="Performed by">{selectedLabResult?.performedByName}</ReportField>
          </dl>
          <section className="doctor-lab-report__results" aria-labelledby="doctor-lab-result-heading">
            <h4 id="doctor-lab-result-heading">Test results</h4>
            <LabResultContent result={displayedResult} />
          </section>
          {selectedLabResult?.remarks && <section className="doctor-lab-report__remarks">
            <h4>Laboratory remarks</h4>
            <p>{selectedLabResult.remarks}</p>
          </section>}
          <div className="doctor-lab-report-actions no-print">
            <button type="button" className="btn btn--primary" onClick={() => window.print()} disabled={resultDetailsQuery.isLoading}>
              <Icon name="icon-printer" size={16} />
              <span>Print Result</span>
            </button>
          </div>
        </article>
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
