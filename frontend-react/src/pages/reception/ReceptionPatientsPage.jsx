import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';
import { patientsApi } from '../../api/resources';
import Icon from '../../components/Icon';
import { Modal, FormField, DataTable, useToast } from '../../components/ui';
import { Format, formatAge, formatDate } from '../../utils/format';
import {
  validateName,
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

export function ReceptionPatientsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState(initialSearch);
  const [genderFilter, setGenderFilter] = useState('');
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
  const [registeredPatient, setRegisteredPatient] = useState(null);

  // Fetch Patients
  const { data: patientsData, isLoading, error, refetch } = useQuery({
    queryKey: ['patientsList'],
    queryFn: async () => {
      const res = await patientsApi.list();
      return Array.isArray(res) ? res : (res?.results || []);
    },
  });

  const patientsList = Array.isArray(patientsData) ? patientsData : [];

  // Filtered Patients
  const filteredPatients = useMemo(() => {
    let result = patientsList;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.mrn && p.mrn.toLowerCase().includes(q)) ||
          (p.phone && p.phone.toLowerCase().includes(q))
      );
    }
    if (genderFilter) {
      result = result.filter(
        (p) => p.gender && p.gender.toLowerCase() === genderFilter.toLowerCase()
      );
    }
    return result;
  }, [patientsList, search, genderFilter]);

  // Minor check
  const isMinor = formData.dateOfBirth && ageFromDob(formData.dateOfBirth) < 18;

  // Handle Input Changes with auto-stripping
  const handleInputChange = (field, value) => {
    let cleaned = value;
    if (field === 'name' || field === 'guardianName') {
      cleaned = value.replace(/[^\p{L}\p{M}\s.'’-]/gu, '');
    } else if (field === 'phone' || field === 'guardianPhone') {
      cleaned = value.replace(/[^\d+\s()-]/g, '');
    }
    setFormData((prev) => ({ ...prev, [field]: cleaned }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // Blur validation
  const handleBlur = (field) => {
    let err = '';
    if (field === 'name') err = validateName(formData.name, 'Full name').error;
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

  // Step 1: Validate & proceed to payment
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
    setWizardStep(2);
  };

  // Registration Mutation
  const registerMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        patient: {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          dateOfBirth: formData.dateOfBirth,
          gender: formData.gender,
          address: formData.address?.trim() || null,
          allergies: formData.allergies
            ? formData.allergies.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          bloodGroup: formData.bloodGroup || null,
          guardianName: isMinor ? formData.guardianName.trim() : null,
          guardianPhone: isMinor ? formData.guardianPhone.trim() : null,
        },
        payment: {
          method: formData.paymentMethod,
        },
      };
      return await patientsApi.registerAndPay(payload);
    },
    onSuccess: (data) => {
      const createdPatient = data.patient || data;
      setRegisteredPatient(createdPatient);
      setWizardStep(3);
      queryClient.invalidateQueries(['patientsList']);
      toast.success(`Fee collected. ${createdPatient.name} registered successfully!`);
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (err?.response?.data && typeof err.response.data === 'object'
          ? Object.entries(err.response.data)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
              .join('; ')
          : null) ||
        'Failed to register patient. Please try again.';
      toast.error(msg);
    },
  });

  const resetModal = () => {
    setIsRegisterOpen(false);
    setWizardStep(1);
    setFormData(initialForm);
    setFormErrors({});
    setRegisteredPatient(null);
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
      render: (r) => formatDate(r.registeredOn || r.createdAt || r.created_at),
    },
    {
      key: 'actions',
      label: '',
      width: '90px',
      render: (r) => (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => navigate(`/shared/patient-profile?id=${r.id || r.patient_id}`)}
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="page-header__info">
          <h1 className="text-page-title" style={{ margin: '0 0 0.25rem 0' }}>Patient Directory</h1>
          <p className="text-caption" style={{ margin: 0, color: 'var(--muted)' }}>
            Register new patients, issue MRN, and review records
          </p>
        </div>
        <div className="page-header__actions">
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
              onChange={(e) => setSearch(e.target.value)}
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
            onChange={(e) => setGenderFilter(e.target.value)}
            style={{ width: '140px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Patients DataTable */}
      <div className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
        <DataTable
          columns={columns}
          data={filteredPatients}
          isLoading={isLoading}
          emptyTitle="No patients found"
          emptyMessage="No patient records match your search criteria."
          emptyAction={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setIsRegisterOpen(true)}
            >
              Register New Patient
            </button>
          }
          perPage={10}
          defaultSort="createdAt"
        />
      </div>

      {/* Registration Wizard Modal */}
      <Modal
        isOpen={isRegisterOpen}
        onClose={resetModal}
        title={
          wizardStep === 1
            ? 'Register New Patient — Step 1 of 2'
            : wizardStep === 2
            ? 'Registration Fee & Payment — Step 2 of 2'
            : 'Registration Complete'
        }
        size={wizardStep === 3 ? 'sm' : 'md'}
      >
        {wizardStep === 1 && (
          <form onSubmit={handleProceedToPayment} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <FormField label="Full Name" required error={formErrors.name}>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                  placeholder="e.g. Ramesh Patel"
                  maxLength={60}
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
                  maxLength={15}
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
                  max={new Date().toISOString().split('T')[0]}
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
                  <option value="">Unknown</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Allergies (comma-separated)" error={formErrors.allergies} hint="e.g. Penicillin, Peanuts">
                <input
                  type="text"
                  className="form-input"
                  value={formData.allergies}
                  onChange={(e) => handleInputChange('allergies', e.target.value)}
                  onBlur={() => handleBlur('allergies')}
                  placeholder="e.g. Aspirin, Sulfa drugs"
                />
              </FormField>
            </div>

            <FormField label="Residential Address" error={formErrors.address}>
              <textarea
                className="form-input"
                rows={2}
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                onBlur={() => handleBlur('address')}
                placeholder="Street address, city, pincode"
                maxLength={200}
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
              <button type="submit" className="btn btn--primary">
                <span>Continue to Payment</span>
                <Icon name="icon-arrow-right" size={16} />
              </button>
            </div>
          </form>
        )}

        {wizardStep === 2 && (
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
              Registration fee for <strong>{formData.name}</strong>:
            </p>

            <div
              style={{
                textAlign: 'center',
                padding: '1.5rem',
                background: 'rgba(2, 195, 154, 0.08)',
                borderRadius: '12px',
                border: '1px solid rgba(2, 195, 154, 0.2)',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                One-Time Registration Fee
              </div>
              <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text)', margin: '0.25rem 0' }}>
                ₹200.00
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--success, #10B981)', fontWeight: 500 }}>
                Includes Permanent MRN & Digital Records
              </div>
            </div>

            <FormField label="Payment Method" required>
              <select
                className="form-input"
                value={formData.paymentMethod}
                onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card (Debit / Credit)</option>
                <option value="UPI">UPI (Google Pay, PhonePe, Paytm)</option>
              </select>
            </FormField>

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
                disabled={registerMutation.isPending}
                onClick={() => registerMutation.mutate()}
              >
                {registerMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner spinner-sm" /> Collecting...
                  </span>
                ) : (
                  <span>Collect Fee & Register</span>
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
              <strong>{registeredPatient.name}</strong> has been enrolled and fee bill generated.
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
                Book Later
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
