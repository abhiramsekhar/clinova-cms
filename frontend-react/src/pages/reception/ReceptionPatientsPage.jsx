import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { patientsApi } from '../../api/resources';
import Icon from '../../components/Icon';
import { Modal, FormField, DataTable, useToast } from '../../components/ui';
import { ErrorState } from '../../components/States';
import { Format, formatAge, formatDate } from '../../utils/format';
import {
  validateName,
  validatePatientName,
  validatePhone,
  validateDob,
  validateGender,
  validateAddress,
  validateAllergies,
  validateBloodGroup,
  validatePatientForm,
  ageFromDob,
  MIN_YEAR,
  BLOOD_GROUPS,
  GENDERS,
} from '../../utils/validators';

function registrationErrorDetails(error) {
  const body = error?.response?.data;
  const fieldErrors = {};
  if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (['detail', 'error', 'message', 'code'].includes(key)) continue;
      fieldErrors[key] = (Array.isArray(value) ? value : [value]).map(String).join(', ');
    }
  }
  const message = body?.detail || body?.error || body?.message ||
    Object.entries(fieldErrors).map(([key, value]) => `${key}: ${value}`).join('; ') ||
    (error?.message === 'Network Error'
      ? 'The registration request could not reach the server. Check the connection and try again.'
      : 'Failed to register patient. Please try again.');
  return { message, fieldErrors };
}

function localDateString(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

export function ReceptionPatientsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch.trim());
  const [genderFilter, setGenderFilter] = useState('');
  const [registrationFilter, setRegistrationFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: Details, 2: Payment, 3: Completed

  // Form State
  const initialForm = {
    name: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    allergies: '',
    bloodGroup: '',
    guardianName: '',
    guardianPhone: '',
    paymentMethod: 'CASH',
  };
  const [formData, setFormData] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [registrationError, setRegistrationError] = useState('');
  const [pendingPatientData, setPendingPatientData] = useState(null);
  const [registeredPatient, setRegisteredPatient] = useState(null);
  const [potentialDuplicates, setPotentialDuplicates] = useState([]);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  useEffect(() => {
    setSearch(searchParams.get('search') || '');
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Patients
  const { data: patientsResponse, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['patientsList', registrationFilter, debouncedSearch, genderFilter, page],
    queryFn: async () => {
      const params = { page_size: 20, page, registration: registrationFilter };
      if (debouncedSearch) params.search = debouncedSearch;
      if (genderFilter) params.gender = genderFilter;
      const res = await patientsApi.list(params);
      return res.data || res;
    },
  });

  const patientsList = Array.isArray(patientsResponse) ? patientsResponse : (patientsResponse?.results || []);
  const patientCount = Array.isArray(patientsResponse) ? patientsResponse.length : (patientsResponse?.count || 0);
  const pageCount = Math.max(1, Math.ceil(patientCount / 20));

  // Minor check
  const isMinor = formData.dateOfBirth && ageFromDob(formData.dateOfBirth) < 18;

  // Handle Input Changes with auto-stripping
  const handleInputChange = (field, value) => {
    let cleaned = value;
    if (field === 'guardianName') {
      cleaned = value.replace(/[^\p{L}\p{M}\s.'’-]/gu, '');
    } else if (field === 'guardianPhone') {
      cleaned = value.replace(/\D/g, '').slice(0, 10);
    }
    setFormData((prev) => ({ ...prev, [field]: cleaned }));
    setRegistrationError('');
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // Blur validation
  const handleBlur = (field) => {
    let err = '';
    if (field === 'name') err = validatePatientName(formData.name, 'Full name').error;
    else if (field === 'phone') err = validatePhone(formData.phone).error;
    else if (field === 'dateOfBirth') err = validateDob(formData.dateOfBirth).error;
    else if (field === 'gender') err = validateGender(formData.gender).error;
    else if (field === 'address') err = validateAddress(formData.address).error;
    else if (field === 'allergies') err = validateAllergies(formData.allergies).error;
    else if (field === 'bloodGroup') err = validateBloodGroup(formData.bloodGroup).error;
    else if (field === 'guardianName' && isMinor) err = validateName(formData.guardianName, 'Guardian name').error;
    else if (field === 'guardianPhone' && isMinor) err = validatePhone(formData.guardianPhone, 'Guardian phone').error;

    if (err) {
      setFormErrors((prev) => ({ ...prev, [field]: err }));
    }
  };

  // Validate patient details and check for existing records before saving.
  const handleProceedToPayment = (e) => {
    e.preventDefault();
    const result = validatePatientForm({
      name: formData.name,
      phone: formData.phone,
      dateOfBirth: formData.dateOfBirth,
      gender: formData.gender,
      address: formData.address,
      allergies: formData.allergies,
      bloodGroup: formData.bloodGroup,
      guardianName: formData.guardianName,
      guardianPhone: formData.guardianPhone,
    });

    if (!result.valid) {
      setFormErrors(result.errors);
      toast.error('Please correct the highlighted form errors.');
      return;
    }

    setFormErrors({});
    precheckMutation.mutate(result.data);
  };

  const precheckMutation = useMutation({
    mutationFn: (patient) => patientsApi.precheck(patient),
    onSuccess: (data, patient) => {
      setRegistrationError('');
      setPendingPatientData(patient);
      setPotentialDuplicates(data?.potentialDuplicates || []);
      setDuplicateAcknowledged(false);
      setWizardStep(2);
    },
    onError: (err) => {
      const { message, fieldErrors } = registrationErrorDetails(err);
      if (Object.keys(fieldErrors).length) setFormErrors((previous) => ({ ...previous, ...fieldErrors }));
      setRegistrationError(message);
      toast.error(message);
    },
  });

  // Registration Mutation
  const registerMutation = useMutation({
    mutationFn: async () => {
      return await patientsApi.create({
        ...pendingPatientData,
        confirmPossibleDuplicate: duplicateAcknowledged,
      });
    },
    onSuccess: (data) => {
      const createdPatient = data.patient || data;
      setRegistrationError('');
      setRegisteredPatient(createdPatient);
      setWizardStep(3);
      setRegistrationFilter('today');
      setPage(1);
      setSearch('');
      setDebouncedSearch('');
      queryClient.invalidateQueries({ queryKey: ['patientsList'] });
      toast.success(`${createdPatient.name} registered successfully!`);
    },
    onError: (err) => {
      const { message, fieldErrors } = registrationErrorDetails(err);
      if (err?.response?.data?.code === 'POSSIBLE_DUPLICATE') {
        setPotentialDuplicates(err.response.data.potentialDuplicates || []);
        setDuplicateAcknowledged(false);
        setRegistrationError(message);
        return;
      }
      if (Object.keys(fieldErrors).length) {
        setFormErrors((previous) => ({ ...previous, ...fieldErrors }));
        setWizardStep(1);
      }
      setRegistrationError(message);
      toast.error(message);
    },
  });

  const resetModal = () => {
    setIsRegisterOpen(false);
    setWizardStep(1);
    setFormData(initialForm);
    setFormErrors({});
    setRegistrationError('');
    setPendingPatientData(null);
    setRegisteredPatient(null);
    setPotentialDuplicates([]);
    setDuplicateAcknowledged(false);
  };

  // Columns for DataTable
  const columns = [
    {
      key: 'mrn',
      label: 'MRN',
      sortable: true,
      width: '140px',
      render: (r) => <strong style={{ color: 'var(--primary)' }}>{r.mrn || '-'}</strong>,
    },
    {
      key: 'name',
      label: 'Patient Name',
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {r.gender || 'Unknown'}, {formatAge(r.dateOfBirth || r.dob)}
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      sortable: false,
      render: (r) => r.phone || '-',
    },
    {
      key: 'bloodGroup',
      label: 'Blood Group',
      sortable: true,
      render: (r) => r.bloodGroup || r.blood_group || '-',
    },
    {
      key: 'createdAt',
      label: 'Registered On',
      sortable: true,
      render: (r) => formatDate(r.registeredOn || r.registered_on || r.createdAt || r.created_at),
    },
    {
      key: 'actions',
      label: '',
      width: '170px',
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => navigate({
              pathname: '/shared/patient-profile',
              search: new URLSearchParams({ id: String(r.id || r.patient_id) }).toString(),
            })}
          >
            View
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => navigate({
              pathname: '/shared/patient-profile',
              search: new URLSearchParams({ id: String(r.id || r.patient_id), edit: '1' }).toString(),
            })}
          >
            <Icon name="icon-edit" size={14} /> Edit
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title" style={{ margin: '0 0 0.25rem 0' }}>Patient Directory</h1>
          <p className="text-caption" style={{ margin: 0, color: 'var(--muted)' }}>
            Register new patients, issue MRN, and review records
          </p>
        </div>
        <div className="page-header__actions" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn--primary"
            id="btn-register"
            onClick={() => setIsRegisterOpen(true)}
          >
            <Icon name="icon-user-plus" size={16} />
            <span>Register Patient</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="glass card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px', maxWidth: '420px' }}>
          <div className="search-bar" style={{ width: '100%' }}>
            <span className="search-bar__icon">
              <Icon name="icon-search" size={16} />
            </span>
            <input
              type="text"
              className="search-bar__input"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by patient name, MRN, phone..."
            />
            {search && (
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => setSearch('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: 0 }}
              >
                <Icon name="icon-x" size={12} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            className="form-input"
            value={genderFilter}
            onChange={(e) => { setGenderFilter(e.target.value); setPage(1); }}
            style={{ width: '140px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Patient registration date">
        {[
          ['today', "Today's Registered Patients"],
          ['all', 'All Patients'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={registrationFilter === value}
            className={`tabs__item ${registrationFilter === value ? 'is-active' : ''}`}
            onClick={() => { setRegistrationFilter(value); setPage(1); }}
          >{label}</button>
        ))}
      </div>

      {/* Patients DataTable */}
      <div className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
        {error ? (
          <ErrorState title="Unable to load patients" error={error} onRetry={refetch} />
        ) : (
          <DataTable
            columns={columns}
            data={patientsList}
            isLoading={isLoading || isFetching}
            emptyTitle="No patients found"
            emptyMessage={debouncedSearch ? 'No patients found for this search.' : 'No patient records are available in this view.'}
            emptyAction={
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setIsRegisterOpen(true)}
              >
                Register New Patient
              </button>
            }
            perPage={20}
            defaultSort="createdAt"
            defaultSortDescending
          />
        )}
        {patientCount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <span className="text-caption">{patientCount} patient(s) · Page {page} of {pageCount}</span>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button type="button" className="btn btn--secondary btn--sm" disabled={page <= 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={page >= pageCount || isFetching} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
          </div>
        </div>}
      </div>

      {/* Registration Wizard Modal */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={resetModal}
        title={
          wizardStep === 1
            ? 'Register New Patient'
            : wizardStep === 2
            ? 'Confirm Patient Registration'
            : 'Registration Complete'
        }
        size={wizardStep === 3 ? 'sm' : 'md'}
      >
        {wizardStep === 1 && (
          <form onSubmit={handleProceedToPayment} noValidate>
            {registrationError && <p role="alert" className="form-error" style={{ color: 'var(--danger)', margin: '0 0 1rem' }}>{registrationError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <FormField label="Full Name" required error={formErrors.name}>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                  placeholder="e.g. Ramesh Patel"
                  maxLength={100}
                  required
                />
              </FormField>

              <FormField label="Phone Number" required error={formErrors.phone}>
                <input
                  type="tel"
                  className="form-input"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  onBlur={() => handleBlur('phone')}
                  placeholder="e.g. 9876543210"
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  required
                />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <FormField label="Date of Birth" required error={formErrors.dateOfBirth}>
                <input
                  type="date"
                  className="form-input"
                  value={formData.dateOfBirth}
                  min={`${MIN_YEAR}-01-01`}
                  max={localDateString()}
                  onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                  onBlur={() => handleBlur('dateOfBirth')}
                  required
                />
              </FormField>

              <FormField label="Gender" required error={formErrors.gender}>
                <select
                  className="form-input"
                  value={formData.gender}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  onBlur={() => handleBlur('gender')}
                  required
                >
                  <option value="">Select Gender...</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <FormField label="Blood Group" error={formErrors.bloodGroup}>
                <select
                  className="form-input"
                  value={formData.bloodGroup}
                  onChange={(e) => handleInputChange('bloodGroup', e.target.value)}
                  onBlur={() => handleBlur('bloodGroup')}
                >
                  <option value="">Not provided</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Allergies (comma-separated)" error={formErrors.allergies} hint="Leave blank if unknown; use No Known Allergies only when confirmed.">
                <input
                  type="text"
                  className="form-input"
                  value={formData.allergies}
                  onChange={(e) => handleInputChange('allergies', e.target.value)}
                  onBlur={() => handleBlur('allergies')}
                  placeholder="e.g. Aspirin, Sulfa drugs"
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.5rem', color: 'var(--muted)', fontSize: '.85rem' }}>
                  <input type="checkbox" checked={formData.allergies.trim().toLowerCase() === 'no known allergies'} onChange={(e) => handleInputChange('allergies', e.target.checked ? 'No Known Allergies' : '')} />
                  No Known Allergies (confirmed)
                </label>
              </FormField>
            </div>

            <FormField label="Residential Address" required error={formErrors.address}>
              <textarea
                className="form-input"
                rows={2}
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                onBlur={() => handleBlur('address')}
                placeholder="Street address, city, pincode"
                maxLength={500}
                required
              />
            </FormField>

            {/* Minor Guardian Details */}
            {isMinor && (
              <div
                style={{
                  padding: '1rem',
                  background: 'rgba(5, 102, 141, 0.08)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.75rem' }}>
                  Guardian Details (Required for patients under 18)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <FormField label="Guardian Name" required error={formErrors.guardianName}>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.guardianName}
                      onChange={(e) => handleInputChange('guardianName', e.target.value)}
                      onBlur={() => handleBlur('guardianName')}
                      placeholder="e.g. Priya Patel"
                      required
                    />
                  </FormField>

                  <FormField label="Guardian Phone" required error={formErrors.guardianPhone}>
                    <input
                      type="tel"
                      className="form-input"
                      value={formData.guardianPhone}
                      onChange={(e) => handleInputChange('guardianPhone', e.target.value)}
                      onBlur={() => handleBlur('guardianPhone')}
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      inputMode="numeric"
                      pattern="[6-9][0-9]{9}"
                      required
                    />
                  </FormField>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn btn--secondary" onClick={resetModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={precheckMutation.isPending || !validatePatientForm(formData).valid}>
                {precheckMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner spinner-sm" /> Checking details...
                  </span>
                ) : (
                  <><span>Continue</span><Icon name="icon-arrow-right" size={16} /></>
                )}
              </button>
            </div>
          </form>
        )}

        {wizardStep === 2 && (
          <div>
            {potentialDuplicates.length > 0 && <div role="alert" style={{ padding: '1rem', marginBottom: '1rem', border: '1px solid var(--warning, #D97706)', borderRadius: '8px', background: 'rgba(217,119,6,.08)' }}>
              <strong>Possible existing patient match</strong>
              <p className="text-caption">Review these records before continuing. Shared names or phone numbers can belong to family members; they are not blocked automatically.</p>
              {potentialDuplicates.map((candidate) => <div key={candidate.id}>{candidate.name} · {candidate.mrn || candidate.id} · {candidate.phone || 'No phone'} · {candidate.dateOfBirth || 'DOB unavailable'}</div>)}
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.75rem' }}>
                <input type="checkbox" checked={duplicateAcknowledged} onChange={(e) => setDuplicateAcknowledged(e.target.checked)} />
                I checked these records; this is a new or different patient.
              </label>
            </div>}

            {registrationError && <p role="alert" className="form-error" style={{ color: 'var(--danger)', margin: '1rem 0 0' }}>{registrationError}</p>}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '2rem' }}>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={registerMutation.isPending}
                onClick={() => setWizardStep(1)}
              >
                Back to Details
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={registerMutation.isPending || (potentialDuplicates.length > 0 && !duplicateAcknowledged)}
                onClick={() => registerMutation.mutate()}
              >
                {registerMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner spinner-sm" /> Saving...
                  </span>
                ) : (
                  <span>Register Patient</span>
                )}
              </button>
            </div>
          </div>
        )}

        {wizardStep === 3 && registeredPatient && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--success, #10B981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem auto',
              }}
            >
              <Icon name="icon-check" size={32} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text)' }}>
              Registration Complete!
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
              <strong>{registeredPatient.name}</strong> has been registered. The patient record is saved; any registration fee due will be collected with the first appointment.
            </p>

            <div
              style={{
                background: 'var(--surface, #f8fafc)',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Issued Medical Record Number (MRN)
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.05em' }}>
                {registeredPatient.mrn}
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
              Would you like to book an appointment for this patient now?
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={resetModal}
              >
                Back to Patients
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const patId = registeredPatient.id || registeredPatient.patient_id;
                  resetModal();
                  navigate(`/reception/appointments?patientId=${encodeURIComponent(patId)}`);
                }}
              >
                Book Appointment Now
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ReceptionPatientsPage;
