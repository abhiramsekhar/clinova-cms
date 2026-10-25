import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi, billsApi, labOrdersApi, patientsApi } from '../../api/resources';
import { useAuth } from '../../auth/AuthContext';
import Badge from '../../components/Badge';
import Icon from '../../components/Icon';
import { ErrorState, LoadingState } from '../../components/States';
import { DataTable, FormField, Modal, Tabs, useToast } from '../../components/ui';
import { Format, formatDate, formatDateTime, formatTime } from '../../utils/format';
import { BLOOD_GROUPS, GENDERS, MIN_YEAR, ageFromDob, validatePatientForm } from '../../utils/validators';

function rowsFrom(data) {
  return Array.isArray(data) ? data : (data?.results || []);
}

function localDateString(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function PatientProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const patientId = searchParams.get('id')?.trim();
  const { role, user } = useAuth();
  const staffKey = user?.staffId || user?.id || 'current-user';
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editErrors, setEditErrors] = useState({});
  const [editError, setEditError] = useState('');
  const [editNoKnownAllergies, setEditNoKnownAllergies] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const canViewBilling = role === 'RECEPTIONIST' || role === 'ADMIN';
  const canEditPatient = role === 'RECEPTIONIST' || role === 'ADMIN';
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
  useEffect(() => {
    if (!canEditPatient || searchParams.get('edit') !== '1' || !patientQuery.data) return;
    const patient = patientQuery.data;
    const allergies = Array.isArray(patient.allergies) ? patient.allergies : [];
    const noKnown = allergies.length === 1 && allergies[0].toLowerCase() === 'no known allergies';
    setEditNoKnownAllergies(noKnown);
    setEditData({
      name: patient.name || '', phone: patient.phone || '', dateOfBirth: patient.dateOfBirth || '',
      gender: patient.gender || '', address: patient.address || '', allergies: noKnown ? 'No Known Allergies' : allergies.join(', '),
      bloodGroup: patient.bloodGroup || '', guardianName: patient.guardianName || '',
      guardianPhone: patient.guardianPhone || '',
    });
    setEditErrors({});
    setEditError('');
    setIsEditOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('edit');
    setSearchParams(nextParams, { replace: true });
  }, [canEditPatient, patientQuery.data, searchParams, setSearchParams]);
  const updatePatientMutation = useMutation({
    mutationFn: (payload) => patientsApi.update(patientId, payload),
    onSuccess: () => {
      setIsEditOpen(false);
      setEditError('');
      queryClient.invalidateQueries({ queryKey: ['patientProfile', staffKey, patientId] });
      queryClient.invalidateQueries({ queryKey: ['patientsList'] });
      toast.success('Patient details updated successfully.');
    },
    onError: (error) => {
      const body = error?.response?.data || {};
      const fieldErrors = {};
      Object.entries(body).forEach(([field, value]) => {
        if (['detail', 'message', 'code'].includes(field)) return;
        fieldErrors[field] = Array.isArray(value) ? value.join(', ') : String(value);
      });
      setEditErrors((previous) => ({ ...previous, ...fieldErrors }));
      setEditError(body.detail || body.message || 'Could not update patient details. Review the form and try again.');
    },
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
  const appointments = rowsFrom(appointmentsQuery.data).slice().sort((a, b) => {
    const dateOrder = String(b.date || b.appointmentDate || '').localeCompare(String(a.date || a.appointmentDate || ''));
    return dateOrder || String(b.time || b.slotTime || '').localeCompare(String(a.time || a.slotTime || ''));
  });
  const bills = rowsFrom(billsQuery.data);
  const labRows = role === 'DOCTOR' ? rowsFrom(doctorLabsQuery.data) : (history.labOrders || []);
  const startEditing = () => {
    const allergies = Array.isArray(patient.allergies) ? patient.allergies : [];
    const noKnown = allergies.length === 1 && allergies[0].toLowerCase() === 'no known allergies';
    setEditNoKnownAllergies(noKnown);
    setEditData({
      name: patient.name || '', phone: patient.phone || '', dateOfBirth: patient.dateOfBirth || '',
      gender: patient.gender || '', address: patient.address || '', allergies: noKnown ? 'No Known Allergies' : allergies.join(', '),
      bloodGroup: patient.bloodGroup || '', guardianName: patient.guardianName || '',
      guardianPhone: patient.guardianPhone || '',
    });
    setEditErrors({});
    setEditError('');
    setIsEditOpen(true);
  };
  const updateEditField = (field, value) => {
    const next = { ...editData, [field]: value };
    setEditData(next);
    setEditErrors(previous => ({ ...previous, [field]: validatePatientForm(next).errors[field] || '' }));
    setEditError('');
  };
  const savePatientEdit = (event) => {
    event.preventDefault();
    const result = validatePatientForm(editData);
    if (!result.valid) {
      setEditErrors(result.errors);
      setEditError('Correct the highlighted fields before saving.');
      return;
    }
    updatePatientMutation.mutate({
      ...result.data,
      guardianName: editData.guardianName,
      guardianPhone: editData.guardianPhone,
      bloodGroup: result.data.bloodGroup || '',
    });
  };
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'consultations', label: 'Consultations' },
    ...(role !== 'RECEPTIONIST' ? [
      { key: 'prescriptions', label: 'Prescriptions' },
      { key: 'labs', label: 'Lab Results' },
    ] : []),
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div><h1 className="text-page-title" style={{ margin: '0 0 0.25rem' }}>{patient.name}</h1><p style={{ color: 'var(--muted)', margin: '0 0 1rem' }}>{patient.mrn || 'MRN unavailable'}</p></div>
          {canEditPatient && <button type="button" className="btn btn--secondary" onClick={startEditing}><Icon name="icon-edit" size={16} /> Edit Details</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
          <div><strong>Age / Gender</strong><div>{Format.age(patient.dateOfBirth)}, {patient.gender || '-'}</div></div>
          <div><strong>Date of Birth</strong><div>{formatDate(patient.dateOfBirth)}</div></div>
          <div><strong>Blood Group</strong><div>{patient.bloodGroup || '-'}</div></div>
          <div><strong>Phone</strong><div>{patient.phone || '-'}</div></div>
          <div><strong>Guardian</strong><div>{patient.guardianName ? `${patient.guardianName} (${patient.guardianPhone || '-'})` : '-'}</div></div>
        </div>
      </section>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'overview' && (
        <section className="glass card" style={{ padding: '1.5rem' }}>
          <h2 className="text-card-title">Patient Overview</h2>
          <p><strong>Address:</strong> {patient.address || '-'}</p>
          <p><strong>Allergies:</strong> {patient.allergies?.length ? patient.allergies.join(', ') : 'Not recorded (unknown)'}</p>
          <p><strong>Chronic Conditions:</strong> {Array.isArray(patient.chronicConditions) ? patient.chronicConditions.join(', ') || 'None reported' : patient.chronicConditions || 'None reported'}</p>
          <p><strong>Registered:</strong> {formatDate(patient.createdAt || patient.registeredOn)}</p>
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

      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Patient Details" size="md">
        {editData && <form onSubmit={savePatientEdit} noValidate>
          {editError && <p role="alert" className="form-error" style={{ marginBottom: '1rem' }}>{editError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem' }}>
            <FormField label="Patient Name" required error={editErrors.name}><input className="form-input" required maxLength={100} value={editData.name} onChange={(e) => updateEditField('name', e.target.value)} /></FormField>
            <FormField label="Phone Number" required error={editErrors.phone}><input className="form-input" type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" required value={editData.phone} onChange={(e) => updateEditField('phone', e.target.value)} /></FormField>
            <FormField label="Date of Birth" required error={editErrors.dateOfBirth}><input className="form-input" type="date" min={`${MIN_YEAR}-01-01`} max={localDateString()} required value={editData.dateOfBirth} onChange={(e) => updateEditField('dateOfBirth', e.target.value)} /></FormField>
            <FormField label="Gender" required error={editErrors.gender}><select className="form-input" required value={editData.gender} onChange={(e) => updateEditField('gender', e.target.value)}><option value="">Select Gender</option>{GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</select></FormField>
            <FormField label="Blood Group" error={editErrors.bloodGroup}><select className="form-input" value={editData.bloodGroup} onChange={(e) => updateEditField('bloodGroup', e.target.value)}><option value="">Not provided</option>{BLOOD_GROUPS.map((blood) => <option key={blood} value={blood}>{blood}</option>)}</select></FormField>
          </div>
          <FormField label="Residential Address" required error={editErrors.address}><textarea className="form-input" rows={3} maxLength={500} required value={editData.address} onChange={(e) => updateEditField('address', e.target.value)} /></FormField>
          <FormField label="Allergies" error={editErrors.allergies} hint="Leave blank if unknown; use No Known Allergies only when confirmed.">
            <input className="form-input" value={editData.allergies} onChange={(e) => { setEditNoKnownAllergies(false); updateEditField('allergies', e.target.value); }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.5rem' }}><input type="checkbox" checked={editNoKnownAllergies} onChange={(e) => { setEditNoKnownAllergies(e.target.checked); updateEditField('allergies', e.target.checked ? 'No Known Allergies' : ''); }} />No Known Allergies (confirmed)</label>
          </FormField>
          {ageFromDob(editData.dateOfBirth) < 18 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem' }}>
            <FormField label="Guardian Name" required error={editErrors.guardianName}><input className="form-input" required value={editData.guardianName} onChange={(e) => updateEditField('guardianName', e.target.value)} /></FormField>
            <FormField label="Guardian Phone" required error={editErrors.guardianPhone}><input className="form-input" required maxLength={10} inputMode="numeric" value={editData.guardianPhone} onChange={(e) => setEditData((prev) => ({ ...prev, guardianPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} /></FormField>
          </div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn--secondary" onClick={() => setIsEditOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={updatePatientMutation.isPending || !validatePatientForm(editData).valid}>{updatePatientMutation.isPending ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}
