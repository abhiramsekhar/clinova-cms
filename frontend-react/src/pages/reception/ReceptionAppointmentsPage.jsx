import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';
import { appointmentsApi, patientsApi, staffApi, billsApi } from '../../api/resources';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { Modal, ConfirmDialog, FormField, DataTable, useToast } from '../../components/ui';
import { Format, formatTime, formatDate } from '../../utils/format';

export function ReceptionAppointmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedPatientId = searchParams.get('patientId');
  const toast = useToast();
  const queryClient = useQueryClient();

  const todayStr = new Date().toISOString().split('T')[0];
  const [filterDate, setFilterDate] = useState(todayStr);
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [bookingData, setBookingData] = useState({
    patient: null,
    doctor: null,
    mode: 'WALK_IN', // 'WALK_IN' | 'PRIOR'
    date: todayStr,
    slot: null,
    type: 'New Visit',
    fee: 30000,
    paymentMethod: 'CASH',
  });
  const [bookedResult, setBookedResult] = useState(null);

  // Collect Fee Modal state
  const [feeModalAppt, setFeeModalAppt] = useState(null);
  const [feePaymentMethod, setFeePaymentMethod] = useState('CASH');

  // Cancel Modal state
  const [cancelModalAppt, setCancelModalAppt] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefund, setCancelRefund] = useState(true);

  // No-Show Confirm state
  const [noShowAppt, setNoShowAppt] = useState(null);

  // Fetch Appointments
  const { data: appointmentsData, isLoading: apptsLoading, refetch: refetchAppts } = useQuery({
    queryKey: ['appointmentsList', filterDate, filterDoctor, filterStatus, searchQuery],
    queryFn: async () => {
      const params = {};
      if (filterDate) params.date = filterDate;
      if (filterDoctor) params.doctor = filterDoctor;
      if (filterStatus) params.status = filterStatus;
      if (searchQuery) params.search = searchQuery;
      const res = await appointmentsApi.list(params);
      return Array.isArray(res) ? res : (res?.results || []);
    },
  });

  // Fetch Doctors
  const { data: doctorsData } = useQuery({
    queryKey: ['activeDoctors'],
    queryFn: async () => {
      const res = await staffApi.doctors();
      return Array.isArray(res) ? res : (res?.results || []);
    },
  });

  // Fetch Patients for Wizard
  const { data: patientsData } = useQuery({
    queryKey: ['allPatientsForWizard'],
    queryFn: async () => {
      const res = await patientsApi.list();
      return Array.isArray(res) ? res : (res?.results || []);
    },
  });

  const apptsList = Array.isArray(appointmentsData) ? appointmentsData : [];
  const doctorsList = Array.isArray(doctorsData) ? doctorsData : [];
  const patientsList = Array.isArray(patientsData) ? patientsData : [];

  // Slot board for selected doctor & date
  const { data: slotBoardData, isLoading: slotsLoading } = useQuery({
    queryKey: ['slotBoard', bookingData.doctor?.id, bookingData.date],
    queryFn: async () => {
      if (!bookingData.doctor?.id) return [];
      const res = await appointmentsApi.slotBoard({
        doctor: bookingData.doctor.id,
        date: bookingData.date,
      });
      return Array.isArray(res) ? res : [];
    },
    enabled: !!(bookingData.doctor?.id && bookingData.mode === 'PRIOR'),
  });

  // Next walk-in slot
  const { data: nextWalkinSlot, isLoading: walkinLoading } = useQuery({
    queryKey: ['nextWalkinSlot', bookingData.doctor?.id],
    queryFn: async () => {
      if (!bookingData.doctor?.id) return null;
      try {
        return await appointmentsApi.nextWalkinSlot({ doctor: bookingData.doctor.id });
      } catch {
        return null;
      }
    },
    enabled: !!(bookingData.doctor?.id && bookingData.mode === 'WALK_IN'),
  });

  // Pre-select patient if query param passed
  useEffect(() => {
    if (preselectedPatientId && patientsList.length > 0) {
      const found = patientsList.find(
        (p) => (p.id || p.patient_id) === preselectedPatientId
      );
      if (found) {
        setBookingData((prev) => ({ ...prev, patient: found }));
        setIsWizardOpen(true);
        setWizardStep(2);
      }
    }
  }, [preselectedPatientId, patientsList]);

  // Actions Mutations
  const checkInMutation = useMutation({
    mutationFn: async (id) => await appointmentsApi.checkIn(id),
    onSuccess: () => {
      toast.success('Patient checked in successfully.');
      queryClient.invalidateQueries(['appointmentsList']);
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to check in patient.';
      toast.error(msg);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason, refund }) =>
      await appointmentsApi.cancel(id, { reason, refund }),
    onSuccess: () => {
      toast.success('Appointment cancelled.');
      setCancelModalAppt(null);
      setCancelReason('');
      queryClient.invalidateQueries(['appointmentsList']);
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to cancel appointment.';
      toast.error(msg);
    },
  });

  const noShowMutation = useMutation({
    mutationFn: async (id) => await appointmentsApi.noShow(id),
    onSuccess: () => {
      toast.success('Marked as No-show. Slot released.');
      setNoShowAppt(null);
      queryClient.invalidateQueries(['appointmentsList']);
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to mark as no-show.';
      toast.error(msg);
    },
  });

  const collectFeeMutation = useMutation({
    mutationFn: async ({ billId, amount, method }) =>
      await billsApi.receivePayment(billId, { amount, method }),
    onSuccess: () => {
      toast.success('Payment received. You can check the patient in now.');
      setFeeModalAppt(null);
      queryClient.invalidateQueries(['appointmentsList']);
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to record payment.';
      toast.error(msg);
    },
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        patientId: bookingData.patient.id || bookingData.patient.patient_id,
        doctorId: bookingData.doctor.id || bookingData.doctor.staff_id,
        mode: bookingData.mode,
        date: bookingData.mode === 'WALK_IN' ? todayStr : bookingData.date,
        time: bookingData.mode === 'WALK_IN' ? nextWalkinSlot?.time : bookingData.slot?.time,
        type: bookingData.type,
        payment: {
          method: bookingData.paymentMethod,
        },
      };
      return await appointmentsApi.bookAndPay(payload);
    },
    onSuccess: (data) => {
      setBookedResult(data.appointment || data);
      setWizardStep(5);
      queryClient.invalidateQueries(['appointmentsList']);
      toast.success('Appointment booked and fee collected!');
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        'Double-booking or scheduling conflict occurred. Please pick a different slot.';
      toast.error(msg);
    },
  });

  // Table Columns
  const columns = [
    {
      key: 'tokenNumber',
      label: 'Token',
      width: '90px',
      sortable: true,
      render: (r) => <strong style={{ color: 'var(--primary)' }}>#{r.tokenNumber || '-'}</strong>,
    },
    {
      key: 'time',
      label: 'Time',
      width: '130px',
      sortable: true,
      render: (r) => (
        <div>
          <div>{formatTime(r.slotTime || r.time || r.appointmentTime)}</div>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {r.mode === 'WALK_IN' ? 'Walk-in' : 'Prior booking'}
          </span>
        </div>
      ),
    },
    {
      key: 'patientName',
      label: 'Patient',
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.patientName || r.patient?.name || 'Patient'}</div>
          {(r.patientMrn || r.patient?.mrn) && (
            <code style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {r.patientMrn || r.patient?.mrn}
            </code>
          )}
        </div>
      ),
    },
    {
      key: 'doctorName',
      label: 'Doctor',
      sortable: true,
      render: (r) => (
        <div>
          <div>{r.doctorName || r.doctor?.name || 'Doctor'}</div>
          {(r.departmentName || r.department?.name) && (
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {r.departmentName || r.department?.name}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'fee',
      label: 'Fee',
      width: '110px',
      render: (r) => {
        const bill = Array.isArray(r.bills) && r.bills.length > 0 ? r.bills[0] : r.bill;
        if (!bill) return <span style={{ color: 'var(--muted)' }}>-</span>;
        return <Badge status={bill.payment_status || bill.status} />;
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => <Badge status={r.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '230px',
      render: (r) => {
        if (r.status !== 'SCHEDULED') return null;
        const bill = Array.isArray(r.bills) && r.bills.length > 0 ? r.bills[0] : r.bill;
        const isPaid = bill && (bill.payment_status === 'PAID' || bill.status === 'PAID');

        return (
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
            {!isPaid ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => setFeeModalAppt(r)}
              >
                Collect Fee
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => checkInMutation.mutate(r.id || r.appointment_id)}
                disabled={checkInMutation.isPending}
              >
                Check In
              </button>
            )}

            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setNoShowAppt(r)}
              title="Patient did not arrive"
            >
              No-show
            </button>

            <button
              type="button"
              className="btn btn--danger btn--sm btn--icon"
              onClick={() => {
                setCancelModalAppt(r);
                setCancelReason('');
                setCancelRefund(true);
              }}
              title="Cancel appointment"
            >
              <Icon name="icon-x" size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  // Search filter for patients in Step 1
  const [patientSearchInWizard, setPatientSearchInWizard] = useState('');
  const wizardFilteredPatients = useMemo(() => {
    if (!patientSearchInWizard.trim()) return patientsList.slice(0, 8);
    const q = patientSearchInWizard.toLowerCase().trim();
    return patientsList.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.mrn && p.mrn.toLowerCase().includes(q)) ||
        (p.phone && p.phone.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [patientsList, patientSearchInWizard]);

  const resetWizard = () => {
    setIsWizardOpen(false);
    setWizardStep(1);
    setBookingData({
      patient: null,
      doctor: null,
      mode: 'WALK_IN',
      date: todayStr,
      slot: null,
      type: 'New Visit',
      fee: 30000,
      paymentMethod: 'CASH',
    });
    setBookedResult(null);
    setPatientSearchInWizard('');
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="page-header__info">
          <h1 className="text-page-title" style={{ margin: '0 0 0.25rem 0' }}>Appointment Scheduling</h1>
          <p className="text-caption" style={{ margin: 0, color: 'var(--muted)' }}>
            Book appointments, manage walk-in queues, and check-in arrivals
          </p>
        </div>
        <div className="page-header__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setIsWizardOpen(true);
              setWizardStep(1);
            }}
          >
            <Icon name="icon-calendar" size={16} />
            <span>Book Appointment</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
          <div className="search-bar" style={{ maxWidth: '280px', flex: 1 }}>
            <span className="search-bar__icon">
              <Icon name="icon-search" size={16} />
            </span>
            <input
              type="text"
              className="search-bar__input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient, doctor..."
            />
          </div>

          <input
            type="date"
            className="form-input"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ width: '160px', padding: '0.5rem 0.75rem' }}
          />

          <select
            className="form-input"
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            style={{ width: '180px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Doctors</option>
            {doctorsList.map((d) => (
              <option key={d.id || d.staff_id} value={d.id || d.staff_id}>
                {d.name} ({d.departmentName || d.department?.name || 'General'})
              </option>
            ))}
          </select>

          <select
            className="form-input"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ width: '150px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="CHECKED_IN">Checked In</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="NO_SHOW">No-show</option>
          </select>
        </div>

        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => {
            setFilterDate(todayStr);
            setFilterDoctor('');
            setFilterStatus('');
            setSearchQuery('');
          }}
        >
          Reset Filters
        </button>
      </div>

      {/* Appointments DataTable */}
      <div className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
        <DataTable
          columns={columns}
          data={apptsList}
          isLoading={apptsLoading}
          emptyTitle="No appointments found"
          emptyMessage="No scheduled appointments found for this selection."
          emptyAction={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setIsWizardOpen(true);
                setWizardStep(1);
              }}
            >
              Book New Appointment
            </button>
          }
          perPage={10}
          defaultSort="time"
        />
      </div>

      {/* 5-Step Booking Wizard Modal */}
      <Modal
        isOpen={isWizardOpen}
        onClose={resetWizard}
        title={
          wizardStep === 1
            ? 'Book Appointment — Step 1: Select Patient'
            : wizardStep === 2
            ? 'Book Appointment — Step 2: Select Doctor'
            : wizardStep === 3
            ? 'Book Appointment — Step 3: Choose Mode & Slot'
            : wizardStep === 4
            ? 'Book Appointment — Step 4: Consultation Fee & Payment'
            : 'Appointment Confirmed & Token Issued'
        }
        size={wizardStep === 5 ? 'sm' : 'md'}
      >
        {/* Step Indicator */}
        {wizardStep < 5 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: '4px',
                  borderRadius: '2px',
                  background: s <= wizardStep ? 'var(--primary)' : 'var(--border)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
        )}

        {/* Step 1: Patient Selection */}
        {wizardStep === 1 && (
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              Select a patient from records. If not registered,{' '}
              <a href="/reception/patients" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                register patient first
              </a>.
            </p>

            <div className="search-bar" style={{ marginBottom: '1rem' }}>
              <span className="search-bar__icon">
                <Icon name="icon-search" size={16} />
              </span>
              <input
                type="text"
                className="search-bar__input"
                value={patientSearchInWizard}
                onChange={(e) => setPatientSearchInWizard(e.target.value)}
                placeholder="Search patient name, MRN, phone..."
                autoFocus
              />
            </div>

            <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              {wizardFilteredPatients.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                  No patients found.
                </div>
              ) : (
                wizardFilteredPatients.map((p) => {
                  const isSelected = bookingData.patient?.id === p.id;
                  return (
                    <div
                      key={p.id || p.patient_id}
                      onClick={() => setBookingData((prev) => ({ ...prev, patient: p }))}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(5, 102, 141, 0.12)' : 'transparent',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          MRN: <strong>{p.mrn}</strong> • Phone: {p.phone}
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{ color: 'var(--primary)' }}>
                          <Icon name="icon-check" size={18} />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!bookingData.patient}
                onClick={() => setWizardStep(2)}
              >
                <span>Select Doctor</span>
                <Icon name="icon-arrow-right" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Doctor Selection */}
        {wizardStep === 2 && (
          <div>
            <div style={{ padding: '0.75rem', background: 'rgba(5, 102, 141, 0.08)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Patient Selected:</span>
                <div style={{ fontWeight: 600 }}>{bookingData.patient?.name} ({bookingData.patient?.mrn})</div>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setWizardStep(1)}
              >
                Change
              </button>
            </div>

            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              Select consulting physician for this visit:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '260px', overflowY: 'auto' }}>
              {doctorsList.map((doc) => {
                const isSelected = bookingData.doctor?.id === doc.id;
                const feePaise = doc.consultation_fee || doc.consultationFee || 30000;
                return (
                  <div
                    key={doc.id || doc.staff_id}
                    onClick={() =>
                      setBookingData((prev) => ({
                        ...prev,
                        doctor: doc,
                        fee: feePaise,
                      }))
                    }
                    style={{
                      padding: '0.875rem 1rem',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'rgba(5, 102, 141, 0.12)' : 'var(--surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{doc.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {doc.departmentName || doc.department?.name || 'General Medicine'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {Format.money(feePaise)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Consultation fee</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
              <button type="button" className="btn btn--secondary" onClick={() => setWizardStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!bookingData.doctor}
                onClick={() => setWizardStep(3)}
              >
                <span>Choose Mode & Slot</span>
                <Icon name="icon-arrow-right" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Mode & Slot Selection */}
        {wizardStep === 3 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div
                onClick={() => setBookingData((prev) => ({ ...prev, mode: 'WALK_IN' }))}
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  border: `2px solid ${bookingData.mode === 'WALK_IN' ? 'var(--primary)' : 'var(--border)'}`,
                  background: bookingData.mode === 'WALK_IN' ? 'rgba(5, 102, 141, 0.12)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>Walk-in</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                  Patient is present now. Immediate next token.
                </div>
              </div>

              <div
                onClick={() => setBookingData((prev) => ({ ...prev, mode: 'PRIOR' }))}
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  border: `2px solid ${bookingData.mode === 'PRIOR' ? 'var(--primary)' : 'var(--border)'}`,
                  background: bookingData.mode === 'PRIOR' ? 'rgba(5, 102, 141, 0.12)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>Prior Booking</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                  Choose date and reserved time slot.
                </div>
              </div>
            </div>

            {bookingData.mode === 'WALK_IN' ? (
              <div
                style={{
                  padding: '1.25rem',
                  background: 'rgba(2, 195, 154, 0.08)',
                  borderRadius: '8px',
                  border: '1px solid rgba(2, 195, 154, 0.25)',
                  marginBottom: '1rem',
                  textAlign: 'center',
                }}
              >
                {walkinLoading ? (
                  <div>Looking up next walk-in slot...</div>
                ) : nextWalkinSlot ? (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                      Next Available Walk-in Token
                    </div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', margin: '0.25rem 0' }}>
                      #{nextWalkinSlot.token}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                      Time: <strong>{formatTime(nextWalkinSlot.time)}</strong> (Today)
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--danger)' }}>
                    No walk-in slots remaining today for {bookingData.doctor?.name}.
                  </div>
                )}
              </div>
            ) : (
              <div>
                <FormField label="Appointment Date" required>
                  <input
                    type="date"
                    className="form-input"
                    value={bookingData.date}
                    min={todayStr}
                    onChange={(e) =>
                      setBookingData((prev) => ({ ...prev, date: e.target.value, slot: null }))
                    }
                  />
                </FormField>

                <FormField label="Available Time Slot" required>
                  {slotsLoading ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>
                      Loading slots...
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                        gap: '0.5rem',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        padding: '0.25rem',
                      }}
                    >
                      {slotBoardData?.map((s) => {
                        const isSelected = bookingData.slot?.time === s.time;
                        const isBooked = s.status === 'booked' || s.status === 'past';
                        return (
                          <button
                            key={s.time}
                            type="button"
                            disabled={isBooked}
                            onClick={() => setBookingData((prev) => ({ ...prev, slot: s }))}
                            className={`btn ${isSelected ? 'btn--primary' : 'btn--secondary'} btn--sm`}
                            style={{
                              padding: '0.5rem 0.25rem',
                              opacity: isBooked ? 0.4 : 1,
                              cursor: isBooked ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                            }}
                          >
                            <span>{s.time}</span>
                            <small style={{ fontSize: '0.65rem' }}>#{s.token}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </FormField>
              </div>
            )}

            <FormField label="Visit Type">
              <select
                className="form-input"
                value={bookingData.type}
                onChange={(e) => setBookingData((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="New Visit">New Visit</option>
                <option value="Follow-up">Follow-up</option>
              </select>
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
              <button type="button" className="btn btn--secondary" onClick={() => setWizardStep(2)}>
                Back
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={
                  bookingData.mode === 'WALK_IN'
                    ? !nextWalkinSlot
                    : !bookingData.slot
                }
                onClick={() => setWizardStep(4)}
              >
                <span>Proceed to Payment</span>
                <Icon name="icon-arrow-right" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Payment & Confirmation */}
        {wizardStep === 4 && (
          <div>
            <div
              style={{
                padding: '1.25rem',
                background: 'var(--surface, #f8fafc)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Patient</span>
                <strong>{bookingData.patient?.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Doctor</span>
                <strong>{bookingData.doctor?.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Date & Slot</span>
                <strong>
                  {bookingData.mode === 'WALK_IN'
                    ? `Today @ ${formatTime(nextWalkinSlot?.time)}`
                    : `${formatDate(bookingData.date)} @ ${formatTime(bookingData.slot?.time)}`}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Consultation Fee</span>
                <strong style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>
                  {Format.money(bookingData.fee)}
                </strong>
              </div>
            </div>

            <FormField label="Payment Method" required>
              <select
                className="form-input"
                value={bookingData.paymentMethod}
                onChange={(e) => setBookingData((prev) => ({ ...prev, paymentMethod: e.target.value }))}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Credit / Debit Card</option>
                <option value="UPI">UPI (Google Pay, PhonePe, Paytm)</option>
              </select>
            </FormField>

            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              Token number is officially released immediately upon fee confirmation.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={bookMutation.isPending}
                onClick={() => setWizardStep(3)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={bookMutation.isPending}
                onClick={() => bookMutation.mutate()}
              >
                {bookMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner spinner-sm" /> Booking...
                  </span>
                ) : (
                  <span>Collect Fee & Issue Token</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Completed Screen with Token */}
        {wizardStep === 5 && bookedResult && (
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
              Appointment Confirmed!
            </h3>

            <div
              style={{
                background: 'rgba(5, 102, 141, 0.08)',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                margin: '1rem 0 1.5rem 0',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Issued Token Number
              </div>
              <div style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1.1 }}>
                #{bookedResult.tokenNumber || bookedResult.token_number}
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--text)' }}>
                Patient: <strong>{bookedResult.patientName || bookingData.patient?.name}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Doctor: <strong>{bookedResult.doctorName || bookingData.doctor?.name}</strong>
              </div>
            </div>

            <button
              type="button"
              className="btn btn--primary"
              style={{ width: '100%' }}
              onClick={resetWizard}
            >
              Done & Return to Appointments
            </button>
          </div>
        )}
      </Modal>

      {/* Collect Fee Modal */}
      {feeModalAppt && (
        <Modal
          isOpen={!!feeModalAppt}
          onClose={() => setFeeModalAppt(null)}
          title="Collect Consultation Fee"
          size="sm"
        >
          {(() => {
            const bill = Array.isArray(feeModalAppt.bills) && feeModalAppt.bills.length > 0
              ? feeModalAppt.bills[0]
              : feeModalAppt.bill;
            const balancePaise = bill ? Math.round((bill.total_amount - (bill.amount_paid || 0)) * 100) : 30000;

            return (
              <div>
                <div style={{ padding: '1rem', background: 'var(--surface, #f8fafc)', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--muted)' }}>Token</span>
                    <strong>#{feeModalAppt.tokenNumber}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--muted)' }}>Patient</span>
                    <strong>{feeModalAppt.patientName || feeModalAppt.patient?.name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                    <span style={{ color: 'var(--muted)' }}>Balance Due</span>
                    <strong style={{ color: 'var(--danger)', fontSize: '1.1rem' }}>
                      {Format.money(balancePaise)}
                    </strong>
                  </div>
                </div>

                <FormField label="Payment Method" required>
                  <select
                    className="form-input"
                    value={feePaymentMethod}
                    onChange={(e) => setFeePaymentMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI</option>
                  </select>
                </FormField>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setFeeModalAppt(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={collectFeeMutation.isPending}
                    onClick={() =>
                      collectFeeMutation.mutate({
                        billId: bill.id || bill.bill_id,
                        amount: balancePaise,
                        method: feePaymentMethod,
                      })
                    }
                  >
                    Receive {Format.money(balancePaise)}
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Cancel Appointment Modal */}
      {cancelModalAppt && (
        <Modal
          isOpen={!!cancelModalAppt}
          onClose={() => setCancelModalAppt(null)}
          title="Cancel Appointment"
          size="sm"
        >
          <div>
            <FormField label="Reason for cancellation" required>
              <textarea
                className="form-input"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter cancellation reason..."
                required
              />
            </FormField>

            <div style={{ margin: '1rem 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={cancelRefund}
                  onChange={(e) => setCancelRefund(e.target.checked)}
                />
                <span>Refund consultation fee if already paid</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setCancelModalAppt(null)}
              >
                Keep Appointment
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={!cancelReason.trim() || cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate({
                    id: cancelModalAppt.id || cancelModalAppt.appointment_id,
                    reason: cancelReason.trim(),
                    refund: cancelRefund,
                  })
                }
              >
                Cancel Appointment
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Mark No-Show Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!noShowAppt}
        onClose={() => setNoShowAppt(null)}
        title="Mark as No-show"
        message={`The patient did not arrive. The slot will be released for walk-in patients. Are you sure you want to mark Appointment #${noShowAppt?.tokenNumber} as No-show?`}
        confirmLabel="Mark No-show"
        danger
        isLoading={noShowMutation.isPending}
        onConfirm={() => noShowMutation.mutate(noShowAppt?.id || noShowAppt?.appointment_id)}
      />
    </div>
  );
}

export default ReceptionAppointmentsPage;
