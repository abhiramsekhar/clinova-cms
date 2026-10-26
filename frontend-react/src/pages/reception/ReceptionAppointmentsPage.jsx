import './appointment-actions.css';
import { PriorBookingSlotLabel } from './PriorBookingSlotLabel';
import { RebookedAction } from './RebookedAction';
import { BookingPaymentFields, initialBookingPayment } from './bookingPayment';
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { appointmentsApi, patientsApi, staffApi } from '../../api/resources';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { Modal, ConfirmDialog, FormField, DataTable, useToast } from '../../components/ui';
import { ErrorState } from '../../components/States';
import { Format, formatTime, formatDate } from '../../utils/format';

const CLINIC_TIME_ZONE = import.meta.env.VITE_CLINIC_TIME_ZONE || 'Asia/Kolkata';
function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function clinicMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}
function slotHasNotStarted(slot, minute) {
  const [hour, minutes] = slot.time.split(':').map(Number);
  return hour * 60 + minutes >= minute;
}

function reportingTimes(value) {
  if (!value?.reportingStartsAt || !value?.reportingDeadlineAt) return 'Choose a slot to view reporting times';
  const time = (iso) => new Intl.DateTimeFormat('en-IN', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return `${time(value.reportingStartsAt)} – ${time(value.reportingDeadlineAt)}`;
}

function addDaysToDateString(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const NON_CANCELLED_APPOINTMENT_STATUSES = 'SCHEDULED,CHECKED_IN,IN_PROGRESS,COMPLETED,NO_SHOW,REBOOKED';

function printAppointmentToken(appointment, onPrintClosed, preparedWindow = null) {
  if (!appointment?.tokenNumber && !appointment?.token_number) return false;
  const printWindow = preparedWindow || window.open('', '_blank', 'width=620,height=700');
  if (!printWindow) return false;
  const escape = (value) => String(value ?? '—').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const token = appointment.tokenNumber || appointment.token_number;
  const patientName = appointment.patientName || appointment.patient?.name || 'Patient';
  const mrn = appointment.patientMrn || appointment.patient?.mrn;
  const doctor = appointment.doctorName || appointment.doctor?.name || 'Doctor';
  const department = appointment.departmentName || appointment.department?.name || '—';
  const appointmentDate = formatDate(appointment.date);
  const appointmentTime = formatTime(appointment.time);
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Appointment Token ${escape(token)}</title>
    <style>
      @page{size:A5 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17343A;margin:0}
      .ticket{max-width:560px;margin:0 auto;border:2px solid #05668D;border-radius:12px;padding:20px}
      header{text-align:center;border-bottom:1px solid #cfe0e4;padding-bottom:12px;margin-bottom:14px}
      header h1{font-size:20px;color:#05668D;margin:0 0 4px}header p{margin:0;color:#607d85;font-size:12px}
      .token{text-align:center;color:#05668D;font-weight:800;font-size:46px;margin:8px 0 14px}
      table{width:100%;border-collapse:collapse}th,td{padding:7px 4px;border-bottom:1px solid #e5edef;text-align:left;font-size:13px}
      th{width:36%;color:#607d85;font-weight:600}.footer{text-align:center;color:#607d85;font-size:11px;margin-top:14px}
    </style></head><body><main class="ticket"><header><h1>Clinova Healthcare</h1><p>Appointment Token</p></header>
    <div class="token">#${escape(token)}</div><table><tbody>
    <tr><th>Patient</th><td>${escape(patientName)}</td></tr><tr><th>MRN</th><td>${escape(mrn)}</td></tr>
    <tr><th>Doctor</th><td>${escape(doctor)}</td></tr><tr><th>Department</th><td>${escape(department)}</td></tr>
    <tr><th>Date</th><td>${escape(appointmentDate)}</td></tr><tr><th>Time</th><td>${escape(appointmentTime)}</td></tr>
    </tbody></table><div class="footer">${appointment.bookingMode === 'WALK_IN' ? 'You are checked in. Please wait for your token.' : 'Please arrive at the reception desk for check-in.'}</div></main></body></html>`);
  printWindow.document.close();
  let finished = false;
  const finishAfterPrint = () => {
    if (finished) return;
    finished = true;
    printWindow.close();
    onPrintClosed();
  };
  printWindow.addEventListener('afterprint', finishAfterPrint, { once: true });
  printWindow.focus();
  printWindow.print();
  return true;
}

export function ReceptionAppointmentsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedPatientId = searchParams.get('patientId');
  const initialSearch = searchParams.get('search') || '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const todayStr = localDateString();
  const firstPriorDate = addDaysToDateString(todayStr, 1);
  const lastPriorDate = addDaysToDateString(todayStr, 28);
  const [mainSection, setMainSection] = useState('today');
  const appointmentView = mainSection === 'today' ? 'today_schedule' : 'picked_date';
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const changeFilter = (setter, value) => { setter(value); setPage(1); };
  const [filterDate, setFilterDate] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

  // Modals state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return clinicMinute(now);
  });
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
  const [arrivalConfirmed, setArrivalConfirmed] = useState(false);
  useEffect(() => { setArrivalConfirmed(false); }, [isWizardOpen, bookingData.patient, bookingData.mode]);

  // Cancel Modal state
  const [cancelModalAppt, setCancelModalAppt] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  // No-Show Confirm state
  const [noShowAppt, setNoShowAppt] = useState(null);

  // Fetch Appointments
  const { data: appointmentTabCounts } = useQuery({
    queryKey: ['appointmentTabCounts', todayStr],
    queryFn: async () => {
      const result = await appointmentsApi.list({ date: todayStr, page_size: 1 });
      return { scheduledToday: result.count || 0 };
    },
    refetchInterval: 30_000,
  });

  const { data: appointmentsData, isLoading: apptsLoading, error: apptsError, refetch: refetchAppts } = useQuery({
    queryKey: ['appointmentsList', todayStr, appointmentView, filterDate, filterDoctor, filterStatus, searchQuery, page],
    enabled: appointmentView !== 'picked_date' || Boolean(filterDate && filterDate !== todayStr),
    queryFn: async () => {
      const params = { page_size: pageSize, page };
      if (mainSection === 'records') params.exclude_today = 'true';
      if (appointmentView === 'today_schedule') {
        params.date = todayStr;

      } else if (appointmentView === 'picked_date' && filterDate) {
        params.date = filterDate;
      }
      if (filterDoctor) params.doctor = filterDoctor;
      if (filterStatus) params.status = filterStatus;
      if (searchQuery) params.search = searchQuery;
      return appointmentsApi.list(params);
    },
    refetchInterval: 30_000,
  });

  // Fetch Doctors
  const { data: doctorsData, isLoading: doctorsLoading, error: doctorsError, refetch: refetchDoctors } = useQuery({
    queryKey: ['activeDoctors'],
    queryFn: async () => {
      const res = await staffApi.doctors();
      return Array.isArray(res) ? res : (res?.results || []);
    },
  });

  // Fetch Patients for Wizard
  const { data: patientsData, isLoading: patientsLoading, error: patientsError, refetch: refetchPatients } = useQuery({
    queryKey: ['allPatientsForWizard'],
    queryFn: async () => {
      const res = await patientsApi.list({ page_size: 200 });
      return Array.isArray(res) ? res : (res?.results || []);
    },
  });

  const apptsList = Array.isArray(appointmentsData) ? appointmentsData : (appointmentsData?.results || []);
  const doctorsList = Array.isArray(doctorsData) ? doctorsData : [];
  const patientsList = Array.isArray(patientsData) ? patientsData : [];

  const slotDate = bookingData.mode === 'WALK_IN' ? todayStr : bookingData.date;

  const { data: bookingQuote, isLoading: quoteLoading, error: quoteError, refetch: refetchQuote } = useQuery({
    queryKey: ['appointmentBookingQuote', bookingData.patient?.id || bookingData.patient?.patient_id, bookingData.doctor?.id || bookingData.doctor?.staff_id, slotDate, bookingData.slot?.time],
    queryFn: () => appointmentsApi.bookingQuote({
      patient: bookingData.patient.id || bookingData.patient.patient_id,
      doctor: bookingData.doctor.id || bookingData.doctor.staff_id,
      date: slotDate, time: bookingData.slot?.time,
    }),
    enabled: Boolean(bookingData.patient && bookingData.doctor),
  });

  // Slot board for selected doctor & date
  const { data: slotBoardData, isLoading: slotsLoading, isFetching: slotsFetching, error: slotsError, refetch: refetchSlots } = useQuery({
    queryKey: ['slotBoard', bookingData.doctor?.id || bookingData.doctor?.staff_id, slotDate],
    queryFn: async () => {
      const doctorId = bookingData.doctor?.id || bookingData.doctor?.staff_id;
      if (!doctorId) return [];
      const res = await appointmentsApi.slotBoard({
        doctor: doctorId,
        date: slotDate,
      });
      return Array.isArray(res) ? res : [];
    },
    enabled: Boolean(isWizardOpen && wizardStep >= 3 && wizardStep <= 4 && bookingData.doctor),
    staleTime: 0,
    refetchInterval: isWizardOpen && wizardStep >= 3 ? (bookingData.mode === 'WALK_IN' ? 15_000 : 60_000) : false,
  });
  const walkinAvailableSlots = useMemo(
    () => (slotBoardData || []).filter((slot) => slot.state === 'free' && slotHasNotStarted(slot, currentMinute)),
    [slotBoardData, currentMinute],
  );
  const selectedSlotAvailability = slotBoardData?.find((slot) => slot.time === bookingData.slot?.time);
  const selectedSlotIsAvailable = selectedSlotAvailability?.state === 'free' &&
    (bookingData.mode !== 'WALK_IN' || slotHasNotStarted(selectedSlotAvailability, currentMinute));
  const bookingPatientId = bookingData.patient?.id || bookingData.patient?.patient_id;
  const bookingDoctorId = bookingData.doctor?.id || bookingData.doctor?.staff_id;
  const sameDoctorDayQuery = useQuery({
    queryKey: ['sameDoctorDayAppointment', bookingPatientId, bookingDoctorId, slotDate],
    queryFn: () => appointmentsApi.list({
      patient: bookingPatientId,
      doctor: bookingDoctorId,
      date: slotDate,
      status: NON_CANCELLED_APPOINTMENT_STATUSES,
      page_size: 1,
    }),
    enabled: Boolean(isWizardOpen && wizardStep >= 3 && bookingPatientId && bookingDoctorId),
    staleTime: 0,
    refetchInterval: isWizardOpen && wizardStep >= 3 ? 15_000 : false,
  });
  const sameDoctorDayAppointments = Array.isArray(sameDoctorDayQuery.data)
    ? sameDoctorDayQuery.data
    : (sameDoctorDayQuery.data?.results || []);
  const hasSameDoctorDayAppointment = Boolean(
    sameDoctorDayQuery.data?.count > 0 || sameDoctorDayAppointments.length > 0
  );


  useEffect(() => {
    if (!isWizardOpen || (wizardStep < 3 || wizardStep > 4) || bookingData.mode !== 'WALK_IN') return undefined;
    const updateCurrentMinute = () => {
      const now = new Date();
      setCurrentMinute(clinicMinute(now));
    };
    updateCurrentMinute();
    const timer = setInterval(updateCurrentMinute, 10_000);
    return () => clearInterval(timer);
  }, [isWizardOpen, wizardStep, bookingData.mode]);

  useEffect(() => {
    if (!isWizardOpen || wizardStep !== 3 || bookingData.mode !== 'WALK_IN' || slotsLoading || slotsFetching) return;
    setBookingData((previous) => {
      return { ...previous, slot: walkinAvailableSlots[0] || null };
    });
  }, [isWizardOpen, wizardStep, bookingData.mode, slotsLoading, slotsFetching, walkinAvailableSlots]);

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
  const [viewBookingId, setViewBookingId] = useState(null);
  const replacementQuery = useQuery({
    queryKey: ['replacementAppointment', viewBookingId],
    queryFn: () => appointmentsApi.get(viewBookingId), enabled: Boolean(viewBookingId), staleTime: 0,
  });
  const [reportingAppt, setReportingAppt] = useState(null);
  const [reportingForm, setReportingForm] = useState({ arrivalConfirmed: false, registrationVerified: false, method: 'CASH', time: '' });
  const [reportingError, setReportingError] = useState('');
  const [reviewedTotal, setReviewedTotal] = useState(null);
  const openReporting = (appointment) => {
    setReportingAppt(appointment);
    setReportingForm({ arrivalConfirmed: false, registrationVerified: false, method: 'CASH', time: '' });
    setReportingError(''); setReviewedTotal(null);
  };
  const reportingQuote = useQuery({
    queryKey: ['reportingQuote', reportingAppt?.id],
    queryFn: () => appointmentsApi.bookingQuote({ patient: reportingAppt.patientId, doctor: reportingAppt.doctorId, appointmentId: reportingAppt.id }),
    enabled: Boolean(reportingAppt), staleTime: 0,
  });
  const checkInMutation = useMutation({
    mutationFn: () => appointmentsApi.checkIn(reportingAppt.id, {
      arrivalConfirmed: reportingForm.arrivalConfirmed,
      registrationVerified: reportingForm.registrationVerified,
      time: reportingForm.time || undefined,
      expectedTotal: reviewedTotal ?? reportingQuote.data?.total,
      payment: { confirmed: true, method: reportingForm.method },
    }),
    onSuccess: (replacement) => {
      if (replacement.id !== reportingAppt.id) {
        queryClient.setQueriesData({ queryKey: ['appointmentsList'] }, previous => {
          const update = row => row.id === reportingAppt.id ? { ...row, status: 'REBOOKED', lateArrivalHandled: true, replacementAppointmentId: replacement.id } : row;
          return Array.isArray(previous) ? previous.map(update) : previous?.results ? { ...previous, results: previous.results.map(update) } : previous;
        });
      }
      setReportingAppt(null);
      toast.success('Payment verified, patient checked in and token confirmed.');
      for (const key of ['appointmentsList', 'appointmentTabCounts', 'receptionAppointmentsToday', 'receptionDashboard', 'receptionScheduledAppointments', 'slotBoard', 'billsList', 'receptionRecentBills', 'appointmentBookingQuote']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (err) => {
      const data = err?.response?.data;
      if (data?.code === 'SLOT_REVIEW_REQUIRED') {
        setReportingForm(previous => ({ ...previous, time: data.time }));
        setReportingError(`The available slot is ${formatTime(data.time)}. Review this time before confirming again.`);
      } else if (data?.code === 'QUOTE_CHANGED') {
        setReviewedTotal(Number(data.total));
        setReportingError('The outstanding fees changed. Review the updated total before confirming again.');
      } else setReportingError(data?.detail || (Array.isArray(data) ? data.join(' ') : 'Unable to complete reporting.'));
    },
  });
  const [printingToken, setPrintingToken] = useState(false);
  const printPriorToken = async (appointment) => {
    // Open synchronously so browser popup blocking does not follow the API wait.
    const printWindow = window.open('', '_blank', 'width=620,height=700');
    if (!printWindow) { toast.error('Allow pop-ups to print the appointment token.'); return; }
    setPrintingToken(true);
    try {
      const verified = await appointmentsApi.printToken(appointment.id || appointment.appointment_id);
      printAppointmentToken(verified, () => {}, printWindow);
    } catch (err) {
      printWindow.close();
      toast.error(err?.response?.data?.detail || 'Unable to print this token.');
    } finally {
      setPrintingToken(false);
    }
  };

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }) =>
      await appointmentsApi.cancel(id, { reason }),
    onSuccess: () => {
      toast.success('Appointment cancelled.');
      queryClient.invalidateQueries({ queryKey: ['slotBoard'] });
      setCancelModalAppt(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['appointmentsList'] });
      queryClient.invalidateQueries({ queryKey: ['appointmentTabCounts'] });
      queryClient.invalidateQueries({ queryKey: ['receptionAppointmentsToday'] });
      queryClient.invalidateQueries({ queryKey: ['receptionDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['receptionScheduledAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['billsList'] });
      queryClient.invalidateQueries({ queryKey: ['receptionRecentBills'] });
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to cancel appointment.';
      toast.error(msg);
    },
  });

  const noShowMutation = useMutation({
    mutationFn: async (id) => await appointmentsApi.noShow(id),
    onSuccess: () => {
      toast.success('Appointment marked as No-show.');
      queryClient.invalidateQueries({ queryKey: ['slotBoard'] });
      setNoShowAppt(null);
      queryClient.invalidateQueries({ queryKey: ['appointmentsList'] });
      queryClient.invalidateQueries({ queryKey: ['appointmentTabCounts'] });
      queryClient.invalidateQueries({ queryKey: ['receptionAppointmentsToday'] });
      queryClient.invalidateQueries({ queryKey: ['receptionDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['receptionScheduledAppointments'] });
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to mark as no-show.';
      toast.error(msg);
    },
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      const patientId = bookingData.patient.id || bookingData.patient.patient_id;
      const doctorId = bookingData.doctor.id || bookingData.doctor.staff_id;
      const appointmentDate = bookingData.mode === 'WALK_IN' ? todayStr : bookingData.date;
      const existingAppointments = await appointmentsApi.list({
        patient: patientId,
        doctor: doctorId,
        date: appointmentDate,
        status: NON_CANCELLED_APPOINTMENT_STATUSES,
        page_size: 1,
      });
      const existingRows = Array.isArray(existingAppointments)
        ? existingAppointments
        : (existingAppointments?.results || []);
      if (existingAppointments?.count > 0 || existingRows.length > 0) {
        const duplicateError = new Error('This patient already has an appointment with this doctor on the selected date.');
        duplicateError.response = { data: { detail: duplicateError.message, code: 'DUPLICATE_DOCTOR_DAY' } };
        throw duplicateError;
      }

      const payload = {
        patientId,
        doctorId,
        departmentId: bookingData.doctor.departmentId || bookingData.doctor.department_id,
        mode: bookingData.mode,
        arrivalConfirmed,
        date: appointmentDate,
        time: bookingData.slot?.time,
        type: bookingData.type,
        ...initialBookingPayment(bookingData.mode, bookingQuote, bookingData.paymentMethod),
      };
      return await appointmentsApi.bookAndPay(payload);
    },
    onSuccess: (data) => {
      setBookedResult(data.appointment || data);
      setWizardStep(5);
      queryClient.invalidateQueries({ queryKey: ['slotBoard'] });
      queryClient.invalidateQueries({ queryKey: ['sameDoctorDayAppointment'] });
      queryClient.invalidateQueries({ queryKey: ['receptionScheduledAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointmentsList'] });
      queryClient.invalidateQueries({ queryKey: ['appointmentTabCounts'] });
      queryClient.invalidateQueries({ queryKey: ['receptionAppointmentsToday'] });
      queryClient.invalidateQueries({ queryKey: ['receptionDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['billsList'] });
      queryClient.invalidateQueries({ queryKey: ['receptionRecentBills'] });
      queryClient.invalidateQueries({ queryKey: ['appointmentBookingQuote'] });
      toast.success(bookingData.mode === 'PRIOR' ? 'Prior Booking confirmed successfully. Payment is payable at reporting.' : 'Payment recorded and appointment booked!');
    },
    onError: (err) => {
      if (err?.response?.data?.code === 'SLOT_UNAVAILABLE') {
        setBookingData((previous) => ({ ...previous, slot: null }));
        setWizardStep(3);
        queryClient.invalidateQueries({ queryKey: ['slotBoard'] });
      }
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
    ...(mainSection === 'records' ? [{
      key: 'date', label: 'Appointment Date', sortable: true,
      render: (r) => formatDate(r.date),
    }, {
      key: 'createdAt', label: 'Booked On', sortable: true,
      render: (r) => r.createdAt ? formatDate(r.createdAt) : '—',
    }] : []),
    {
      key: 'time',
      label: 'Time',
      width: '130px',
      sortable: true,
      render: (r) => formatTime(r.slotTime || r.time || r.appointmentTime),
    },
    {
      key: 'bookingMode',
      label: 'Booking',
      width: '130px',
      render: (r) => r.bookingMode === 'WALK_IN' ? 'Walk-in' : 'Prior booking',
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
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => <Badge status={r.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '290px',
      render: (r) => {
        if (r.bookingMode === 'WALK_IN') return null;
        if (r.status === 'REBOOKED' || r.lateArrivalHandled) return <RebookedAction appointment={r} onView={setViewBookingId} />;
        if (!['SCHEDULED', 'NO_SHOW', 'CHECKED_IN'].includes(r.status)) return null;
        const isScheduled = r.status === 'SCHEDULED';
        const checkInAllowed = r.date === todayStr;
        const busy = checkInMutation.isPending || noShowMutation.isPending || cancelMutation.isPending || printingToken;
        return (
          <div className="appointment-actions">
            {isScheduled && <button type="button" className="appointment-action appointment-action--checkin"
              disabled={!checkInAllowed || busy} title="Report arrival, review fees and check in on the appointment date"
              onClick={() => openReporting(r)}>
              <Icon name="icon-check" size={16} /> Report & Pay
            </button>}
            {mainSection === 'today' && isScheduled && <button type="button" className="appointment-action appointment-action--noshow"
              disabled={busy || r.date > todayStr} onClick={() => setNoShowAppt(r)}>No-show</button>}
            {r.status === 'NO_SHOW' && r.date === todayStr && <button type="button" className="appointment-action" disabled={busy}
              onClick={() => openReporting(r)}>Report Late Arrival</button>}
            {r.status === 'CHECKED_IN' && r.date === todayStr && <button type="button" className="appointment-action" disabled={busy || r.billStatus !== 'PAID' || !r.tokenNumber}
              onClick={() => printPriorToken(r)}><Icon name="icon-printer" size={16} /> Print Token</button>}
            {['SCHEDULED', 'NO_SHOW'].includes(r.status) && <button type="button" className="appointment-action appointment-action--cancel" disabled={busy}
              onClick={() => { setCancelModalAppt(r); setCancelReason(''); }}>
              Cancel
            </button>}
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

  const displayedSlots = bookingData.mode === 'WALK_IN'
    ? walkinAvailableSlots
    : (slotBoardData || []);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title" style={{ margin: '0 0 0.25rem 0' }}>Appointments</h1>
          <p className="text-caption" style={{ margin: 0, color: 'var(--muted)' }}>
            Manage today's appointments and view booking records
          </p>
        </div>
        <div className="page-header__actions" style={{ marginLeft: 'auto' }}>
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

      <section className="glass card" style={{ padding: 0, marginBottom: '1.5rem', borderRadius: '12px', overflow: 'hidden' }}>
        <div className="tabs" role="tablist" aria-label="Appointment sections">
          {[["today", "Today's Appointments"], ['records', 'Appointment Records']].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={mainSection === value}
              className={`tabs__item ${mainSection === value ? 'is-active' : ''}`}
              onClick={() => changeFilter(setMainSection, value)} style={{ padding: '1rem 1.25rem' }}>
              {label}{value === 'today' && appointmentTabCounts && <span style={{ marginLeft: '.35rem' }}>({appointmentTabCounts.scheduledToday})</span>}
            </button>
          ))}
        </div>
        <div className="appointment-filter-panel">
            {mainSection === 'records' && (
              <label className="appointment-date-filter">
                Choose Appointment Date
                <input
                  type="date"
                  className="form-input"
                  value={filterDate}
                  onChange={(e) => {
                    if (e.target.value === todayStr) {
                      toast.error('Choose a past or future date. Today’s appointments are in Today’s Appointments.');
                      e.target.value = filterDate;
                      return;
                    }
                    changeFilter(setFilterDate, e.target.value);
                  }}
                  aria-label="Pick appointment date"
                  aria-describedby="appointment-record-date-help"
                  style={{ width: '165px', padding: '0.5rem 0.75rem' }}
                />
                <small id="appointment-record-date-help">Past or future dates only</small>
              </label>
            )}
          <div className="appointment-filter-row">
            <div className="search-bar" >
              <span className="search-bar__icon"><Icon name="icon-search" size={16} /></span>
              <input
                type="text"
                className="search-bar__input"
                value={searchQuery}
                onChange={(e) => changeFilter(setSearchQuery, e.target.value)}
                placeholder="Search name, MRN, phone or token..."
                aria-label="Search appointments by patient name, MRN, phone or token"
              />
            </div>

            <select
              className="form-input"
              value={filterDoctor}
              onChange={(e) => changeFilter(setFilterDoctor, e.target.value)}
              aria-label="Filter by doctor"
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
              onChange={(e) => changeFilter(setFilterStatus, e.target.value)}
              aria-label="Filter by appointment status"
              style={{ width: '150px', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NO_SHOW">No-show</option>
              <option value="REBOOKED">Arrived Late (Rebooked)</option>
            </select>
          </div>


        </div>

        {/* Appointments DataTable */}
        <div style={{ padding: '1.25rem' }}>
        {apptsError ? (
          <ErrorState title="Unable to load appointments" error={apptsError} onRetry={refetchAppts} />
        ) : (
          <DataTable
            key={`${appointmentView}-${page}-${searchQuery}-${filterDate}-${filterDoctor}-${filterStatus}`}
            columns={columns}
            data={apptsList}
            isLoading={apptsLoading}
            emptyTitle="No appointments found"
            emptyMessage={mainSection === 'records' && appointmentView === 'picked_date' && filterDate === todayStr
              ? 'Open Today’s Appointments to view and manage today’s appointments.'

              : appointmentView === 'picked_date' && !filterDate
              ? 'Choose a date to view appointments.'
              : 'No appointments match this view.'}
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
            perPage={pageSize}
            defaultSort={searchQuery.trim() ? 'date' : 'time'}
            defaultSortDescending={Boolean(searchQuery.trim())}
          />
        )}
        {!apptsError && !apptsLoading && (appointmentsData?.count || 0) > 0 && <div className="appointment-pagination">
          <span className="text-caption">{(page - 1) * pageSize + 1}?{Math.min(page * pageSize, appointmentsData.count)} of {appointmentsData.count} appointments</span>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button type="button" className="btn btn--secondary btn--sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={!appointmentsData.next} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>}
        </div>
      </section>

      {/* 5-Step Booking Wizard Modal */}
      <Modal
        isOpen={isWizardOpen}
        onClose={() => {
          resetWizard();
          navigate('/reception/appointments', { replace: true });
        }}
        title={
          wizardStep === 1
            ? 'Book Appointment — Step 1: Select Patient'
            : wizardStep === 2
            ? 'Book Appointment — Step 2: Select Doctor'
            : wizardStep === 3
            ? 'Book Appointment — Step 3: Choose Mode & Slot'
            : wizardStep === 4
            ? (bookingData.mode === 'PRIOR' ? 'Book Appointment — Step 4: Confirm Prior Booking' : 'Book Appointment — Step 4: Consultation Fee & Payment')
            : (bookedResult?.bookingMode === 'PRIOR' ? 'Prior Booking Confirmed' : 'Appointment Confirmed & Token Issued')
        }
        size={wizardStep === 3 ? 'lg' : wizardStep === 5 ? 'sm' : 'md'}
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
              {patientsError ? (
                <ErrorState title="Unable to load patients" error={patientsError} onRetry={refetchPatients} />
              ) : patientsLoading ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>Loading patients…</div>
              ) : wizardFilteredPatients.length === 0 ? (
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
              {doctorsError ? (
                <ErrorState title="Unable to load doctors" error={doctorsError} onRetry={refetchDoctors} />
              ) : doctorsLoading ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Loading doctors…</div>
              ) : doctorsList.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>No active doctors are available.</div>
              ) : doctorsList.map((doc) => {
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
                onClick={() => setBookingData((prev) => ({ ...prev, mode: 'WALK_IN', date: todayStr, slot: null }))}
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
                  Patient is present today. The next available slot is selected automatically.
                </div>
              </div>

              <div
                onClick={() => setBookingData((prev) => ({ ...prev, mode: 'PRIOR', date: prev.date < firstPriorDate ? firstPriorDate : prev.date, slot: null }))}
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
                  Choose a date from tomorrow through the next 28 days.
                </div>
              </div>
            </div>

            {sameDoctorDayQuery.isFetching && <p role="status" className="text-caption">Checking this patient’s appointments with the selected doctor for this date…</p>}
            {sameDoctorDayQuery.error && <ErrorState title="Unable to check for an existing appointment" error={sameDoctorDayQuery.error} onRetry={sameDoctorDayQuery.refetch} />}
            {hasSameDoctorDayAppointment && <p role="alert" style={{ padding: '.75rem 1rem', borderRadius: 8, color: 'var(--danger, #B42318)', background: 'rgba(220, 38, 38, .08)' }}>
              This patient already has an appointment with this doctor on {formatDate(slotDate)}. Choose another doctor or date. Cancelled appointments do not prevent rebooking.
            </p>}

            <div>
              {bookingData.mode === 'PRIOR' ? (
                <FormField label="Appointment Date" required>
                  <input
                    type="date"
                    className="form-input"
                    value={bookingData.date}
                    min={firstPriorDate}
                    max={lastPriorDate}
                    onChange={(e) =>
                      setBookingData((prev) => ({ ...prev, date: e.target.value, slot: null }))
                    }
                  />
                </FormField>
              ) : (
                <p className="text-caption" style={{ margin: '0 0 0.75rem', color: 'var(--muted)' }}>
                  Next available walk-in slot for {bookingData.doctor?.name} ({formatDate(todayStr)}).
                </p>
              )}

              <FormField label="Available Time Slot" required>
                {slotsError ? (
                  <ErrorState title="Unable to load time slots" error={slotsError} onRetry={refetchSlots} />
                ) : slotsLoading ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Loading slots...</div>
                ) : bookingData.mode === 'WALK_IN' && walkinAvailableSlots.length ? (
                  <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(5, 102, 141, 0.08)', border: '1px solid var(--border)' }}>
                    <strong style={{ display: 'block', fontSize: '1.2rem', color: 'var(--primary)' }}>{formatTime(walkinAvailableSlots[0].time)}</strong>
                    <span>Token #{walkinAvailableSlots[0].token}</span>
                    <p className="text-caption" style={{ margin: '.5rem 0 0' }}>Automatically selected next available walk-in slot.</p>
                  </div>
                ) : bookingData.mode === 'PRIOR' && displayedSlots.length ? (
                  <>
                    <p className="text-caption">Token previews may skip numbers already reserved.</p>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                        gap: '0.6rem',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        padding: '0.25rem',
                      }}
                    >
                      {displayedSlots.map((s) => {
                        const isSelected = bookingData.slot?.time === s.time;
                        const isUnavailable = s.state !== 'free';
                        return (
                          <button
                            key={s.time}
                            type="button"
                            disabled={isUnavailable}
                            title={`${s.time}: ${isUnavailable ? (s.state === 'booked' ? 'Reserved appointment slot' : 'This slot is no longer available') : `Token #${s.token} (Preview)`}`}
                            onClick={() => setBookingData((prev) => ({ ...prev, slot: s }))}
                            className={`btn ${isSelected ? 'btn--primary' : 'btn--secondary'} btn--sm`}
                            style={{
                              padding: '0.5rem 0.25rem',
                              opacity: isUnavailable ? 0.75 : 1,
                              filter: isUnavailable ? 'blur(0.5px)' : 'none',
                              cursor: isUnavailable ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                            }}
                          >
                            <span>{s.time}</span>
                            <PriorBookingSlotLabel slot={s} />
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-caption" style={{ padding: '0.85rem', margin: 0, borderRadius: '8px', background: 'var(--surface)' }}>
                    {bookingData.mode === 'WALK_IN'
                      ? 'No walk-in slots available for today. Please choose another available doctor.'
                      : 'No appointment slots are available for this doctor and date.'}
                  </p>
                )}
              </FormField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.25rem', position: 'sticky', bottom: '-1.25rem', padding: '0.75rem 0 0.25rem', background: 'var(--surface)', zIndex: 1 }}>
              <button type="button" className="btn btn--secondary" onClick={() => setWizardStep(2)}>
                Back
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={
                  slotsLoading || slotsFetching || !bookingData.slot || !selectedSlotIsAvailable || sameDoctorDayQuery.isFetching || Boolean(sameDoctorDayQuery.error) || hasSameDoctorDayAppointment
                }
                onClick={() => setWizardStep(4)}
              >
                <span>{bookingData.mode === 'PRIOR' ? 'Review Prior Booking' : 'Proceed to Payment'}</span>
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
                    ? `Today @ ${formatTime(bookingData.slot?.time)}`
                    : `${formatDate(bookingData.date)} @ ${formatTime(bookingData.slot?.time)}`}
                </strong>
              </div>
              {sameDoctorDayQuery.error ? (
                <div role="alert" style={{ marginTop: '.75rem' }}><ErrorState title="Unable to verify existing appointments" error={sameDoctorDayQuery.error} onRetry={sameDoctorDayQuery.refetch} /></div>
              ) : hasSameDoctorDayAppointment ? (
                <p role="alert" style={{ marginTop: '.75rem', color: 'var(--danger, #B42318)' }}>This patient already has an appointment with this doctor on this date. Return to slot selection and choose another doctor or date.</p>
              ) : null}
              {quoteLoading ? <p>Calculating fees…</p> : quoteError ? (
                <div role="alert" style={{ marginTop: '1rem' }}><ErrorState title="Unable to calculate bill" error={quoteError} onRetry={refetchQuote} /></div>
              ) : bookingQuote ? (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.65rem', marginTop: '0.5rem' }}>
                  {bookingQuote.registrationFeeDue && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}><span>One-time Registration Fee</span><strong>{Format.money(bookingQuote.registrationFee)}</strong></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}><span>Consultation Fee</span><strong>{Format.money(bookingQuote.consultationFee)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}><strong>{bookingData.mode === 'PRIOR' ? 'Payable at Reporting' : 'Total Payable'}</strong><strong style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{Format.money(bookingQuote.total)}</strong></div>
                </div>
              ) : null}
            </div>

            {bookingData.mode === 'WALK_IN' && (
              <label style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
                <input type="checkbox" checked={arrivalConfirmed} onChange={e => setArrivalConfirmed(e.target.checked)} />
                I confirm the patient is physically present. Successful payment will check them in.
              </label>
            )}
            <BookingPaymentFields mode={bookingData.mode} paymentMethod={bookingData.paymentMethod}
              onChange={e => setBookingData(previous => ({ ...previous, paymentMethod: e.target.value }))} />
            {bookingData.mode === 'PRIOR' && <div role="status">
              <p>Reporting Window: <strong>{reportingTimes(bookingQuote)}</strong></p>
              <p>Booking Status: Scheduled. Registration (if unpaid) and consultation fees are payable at reporting.</p>
            </div>}
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
                disabled={(bookingData.mode === 'WALK_IN' && !arrivalConfirmed) || bookMutation.isPending || slotsLoading || slotsFetching || !selectedSlotIsAvailable || sameDoctorDayQuery.isFetching || Boolean(sameDoctorDayQuery.error) || hasSameDoctorDayAppointment || quoteLoading || Boolean(quoteError) || !bookingQuote}
                onClick={() => bookMutation.mutate()}
              >
                {bookMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner spinner-sm" /> Booking...
                  </span>
                ) : (
                  <span>{bookingData.mode === 'WALK_IN' ? 'Confirm Payment & Check In' : 'Confirm Prior Booking'}</span>
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
              {bookedResult.bookingMode === 'WALK_IN' ? 'Patient Checked In!' : 'Appointment Confirmed!'}
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
              {bookedResult.bookingMode === 'WALK_IN' && <>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textTransform: 'uppercase' }}>
                Issued Token Number
              </div>
              <div style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1.1 }}>
                #{bookedResult.tokenNumber || bookedResult.token_number}
              </div>
              </>}
              <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--text)' }}>
                Patient: <strong>{bookedResult.patientName || bookingData.patient?.name}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                MRN: <strong>{bookedResult.patientMrn || bookingData.patient?.mrn || '—'}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Doctor: <strong>{bookedResult.doctorName || bookingData.doctor?.name}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Appointment: <strong>{formatDate(bookedResult.date || bookingData.date)} at {formatTime(bookedResult.time || bookingData.slot?.time)}</strong>
              </div>
            </div>

            {bookedResult.bookingMode === 'PRIOR' ? (
              <>
                <p className="text-caption">Prior Booking confirmed successfully. Please report between {reportingTimes(bookedResult)} on {formatDate(bookedResult.date)}. Applicable registration and consultation payment will be collected during reporting. Your status is Scheduled; no token has been issued.</p>
                <button type="button" className="btn btn--primary" style={{ width: '100%' }} onClick={() => {
                  resetWizard();
                  navigate('/reception/appointments', { replace: true });
                }}>Finish</button>
              </>
            ) : (
            <button
              type="button"
              className="btn btn--primary"
              style={{ width: '100%' }}
              onClick={() => {
                const opened = printAppointmentToken(bookedResult, () => {
                  resetWizard();
                  navigate('/reception/appointments', { replace: true });
                });
                if (!opened) toast.error('Allow pop-ups to print the appointment token. The appointment and payment are saved.');
              }}
              disabled={!bookedResult.tokenNumber && !bookedResult.token_number}
            >
              <Icon name="icon-printer" size={16} /> Print Token &amp; Finish
            </button>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(viewBookingId)} onClose={() => setViewBookingId(null)} title="Replacement Appointment" size="md">
        {replacementQuery.isLoading ? <p>Loading booking…</p> : replacementQuery.error ? <ErrorState error={replacementQuery.error} onRetry={replacementQuery.refetch} /> : replacementQuery.data && <>
          <p>Booking: <strong>{replacementQuery.data.id}</strong></p>
          <p>{replacementQuery.data.patientName} · {replacementQuery.data.patientMrn}</p>
          <p>{replacementQuery.data.doctorName}</p>
          <p>{formatDate(replacementQuery.data.date)} at {formatTime(replacementQuery.data.time)}</p>
          <Badge status={replacementQuery.data.status} />
          <p>Token: {replacementQuery.data.tokenNumber ?? 'Not confirmed'}</p>
          {replacementQuery.data.status === 'CHECKED_IN' && replacementQuery.data.date === todayStr && <button type="button" className="btn btn--primary" disabled={printingToken} onClick={() => printPriorToken(replacementQuery.data)}>Print Token</button>}
        </>}
      </Modal>

      <Modal isOpen={Boolean(reportingAppt)} onClose={() => { if (!checkInMutation.isPending) setReportingAppt(null); }} title="Patient Reporting & Payment" size="md">
        {reportingAppt && <>
          <p><strong>{reportingAppt.patientName}</strong> · {reportingAppt.patientMrn}</p>
          <p>{reportingAppt.doctorName} · {formatDate(reportingAppt.date)} at {formatTime(reportingAppt.time)}</p>
          <p>Reporting Window: {reportingTimes(reportingAppt)}</p>
          {reportingQuote.isLoading ? <p>Calculating fees…</p> : reportingQuote.error ? <ErrorState error={reportingQuote.error} onRetry={reportingQuote.refetch} /> : reportingQuote.data && <>
            {reportingQuote.data.registrationFeeDue && <p>Unpaid Registration Fee: {Format.money(reportingQuote.data.registrationFee)}</p>}
            <p>Consultation Fee: {Format.money(reportingQuote.data.consultationFee)}</p>
            <p><strong>Outstanding Total: {Format.money(reviewedTotal ?? reportingQuote.data.total)}</strong></p>
            <p className="text-caption">Previously paid fees are retained. Registration is charged once.</p>
          </>}
          <label style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}><input type="checkbox" checked={reportingForm.arrivalConfirmed} onChange={e => setReportingForm(p => ({ ...p, arrivalConfirmed: e.target.checked }))} />Patient is physically present.</label>
          <label style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}><input type="checkbox" checked={reportingForm.registrationVerified} onChange={e => setReportingForm(p => ({ ...p, registrationVerified: e.target.checked }))} />I verified the patient's registration details.</label>
          {(reviewedTotal ?? reportingQuote.data?.total) > 0 && <FormField label="Payment Method" required><select className="form-input" value={reportingForm.method} onChange={e => setReportingForm(p => ({ ...p, method: e.target.value }))}><option value="CASH">Cash</option><option value="CARD">Credit / Debit Card</option><option value="UPI">UPI</option></select></FormField>}
          {reportingForm.time && <p>Reviewed late-arrival slot: <strong>{formatTime(reportingForm.time)}</strong></p>}
          {reportingError && <p role="alert">{reportingError}</p>}
          <button type="button" className="btn btn--primary" disabled={!reportingForm.arrivalConfirmed || !reportingForm.registrationVerified || !reportingQuote.data || Boolean(reportingQuote.error) || reportingQuote.isFetching || checkInMutation.isPending} onClick={() => checkInMutation.mutate()}>
            {checkInMutation.isPending ? 'Confirming…' : (reviewedTotal ?? reportingQuote.data?.total) > 0 ? 'Confirm Payment & Check In' : 'Confirm Check In'}
          </button>
        </>}
      </Modal>

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
        message={`Confirm that the patient has not arrived. Mark Appointment #${noShowAppt?.tokenNumber} as No-show?`}
        confirmLabel="Mark No-show"
        danger
        isLoading={noShowMutation.isPending}
        onConfirm={() => noShowMutation.mutate(noShowAppt?.id || noShowAppt?.appointment_id)}
      />
    </div>
  );
}

export default ReceptionAppointmentsPage;
