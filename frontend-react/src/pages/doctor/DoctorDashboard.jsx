import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { appointmentsApi, dashboardApi } from '../../api/resources';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { formatTime } from '../../utils/format';
import './doctor-pages.css';

const today = new Date().toISOString().slice(0, 10);

function getAppointmentRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export function DoctorDashboard() {
  const { user } = useAuth();
  const doctorKey = user?.staffId || user?.id || 'current-doctor';
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['doctorDashboard', doctorKey],
    queryFn: dashboardApi.doctor,
  });

  const {
    data: appointmentsData,
    isLoading: appointmentsLoading,
    error: appointmentsError,
    refetch: refetchAppointments,
  } = useQuery({
    queryKey: ['doctorAppointmentsToday', doctorKey, today],
    queryFn: () => appointmentsApi.list({ doctor: 'me', date: today, page_size: 200 }),
  });

  if (statsLoading || appointmentsLoading) {
    return <LoadingState message="Loading doctor dashboard..." />;
  }

  if (statsError) {
    return <ErrorState title="Failed to load doctor dashboard" error={statsError} onRetry={refetchStats} />;
  }

  const kpis = [
    { label: 'My Patients', value: stats?.patients ?? 0, icon: 'icon-users', color: 'var(--primary)' },
    { label: 'Pending Today', value: stats?.pendingAppointments ?? 0, icon: 'icon-calendar', color: 'var(--warning)' },
    { label: 'Completed Today', value: stats?.completedConsultations ?? 0, icon: 'icon-check-circle', color: 'var(--teal-700)' },
    { label: 'Pending Lab Results', value: stats?.pendingLabs ?? 0, icon: 'icon-flask', color: 'var(--danger)' },
    { label: 'Active Prescriptions', value: stats?.activePrescriptions ?? 0, icon: 'icon-clipboard-list', color: 'var(--primary)' },
  ];
  const appointments = getAppointmentRows(appointmentsData);
  const pendingLabs = Array.isArray(stats?.pendingLabsList) ? stats.pendingLabsList : [];

  return (
    <div className="doctor-workspace doctor-dashboard">
      <div className="page-header doctor-page-header">
        <div className="page-header__info">
          <div className="doctor-page-heading">
            <h1 className="text-page-title">Doctor Dashboard</h1>
            <span className="doctor-current-date">{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span>
          </div>
          <p className="text-caption">Your clinical schedule and pending diagnostic tasks</p>
        </div>
        <div className="page-header__actions">
          <Link to="/doctor/appointments" className="btn btn--primary">
            <Icon name="icon-calendar" size={16} />
            <span>View Full Schedule</span>
          </Link>
        </div>
      </div>

      <div className="stat-row doctor-kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="glass card doctor-kpi-card">
            <div className="doctor-kpi-card__top">
              <span>{kpi.label}</span>
              <div className="doctor-kpi-card__icon"><Icon className="doctor-kpi-card__glyph" name={kpi.icon} size={20} style={{ color: kpi.color }} /></div>
            </div>
            <div className="doctor-kpi-card__value">{kpi.value ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="glass card doctor-panel">
        <div className="doctor-panel__heading">
          <h2 className="text-card-title">Today's Appointments</h2>
          <span className="doctor-panel__count">
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
          </span>
        </div>
        {appointmentsError ? (
          <ErrorState title="Failed to load today's appointments" error={appointmentsError} onRetry={refetchAppointments} />
        ) : appointments.length === 0 ? (
          <EmptyState title="No appointments today" description="Your schedule has no appointments for today." icon="icon-calendar" />
        ) : (
          <div className="table-container doctor-dashboard-table-container">
            <table className="data-table doctor-appointments-table">
              <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
              <thead>
                <tr><th scope="col">Time</th><th scope="col">Token</th><th scope="col">Patient Name</th><th scope="col">MRN</th><th scope="col">Status</th><th scope="col">Action</th></tr>
              </thead>
              <tbody>
                {appointments.slice(0, 10).map((appt) => {
                  const patientName = appt.patientName || appt.patient?.name || 'Patient';
                  const patientMrn = appt.patientMrn || appt.patient?.mrn || '-';
                  const canConsult = ['CHECKED_IN', 'IN_PROGRESS'].includes(appt.status);
                  return (
                    <tr key={appt.id}>
                      <td className="doctor-table-time">{formatTime(appt.time)}</td>
                      <td className="doctor-table-token">{appt.tokenNumber ?? '—'}</td>
                      <td className="doctor-table-patient">{patientName}</td>
                      <td className="doctor-table-mrn"><code>{patientMrn}</code></td>
                      <td><Badge status={appt.status} /></td>
                      <td>
                        {canConsult ? (
                          <Link to={`/doctor/consultation?appointmentId=${encodeURIComponent(appt.id)}`} className="btn btn--secondary btn--sm">Consult</Link>
                        ) : appt.status === 'SCHEDULED' ? (
                          <span className="doctor-muted">Awaiting check-in</span>
                        ) : <span className="doctor-muted">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass card doctor-panel">
        <div className="doctor-panel__heading">
          <h2 className="text-card-title">Pending Lab Results</h2>
          <Link to="/doctor/lab-orders" className="btn btn--secondary btn--sm">View Lab Orders</Link>
        </div>
        {pendingLabs.length === 0 ? (
          <EmptyState title="No pending lab results" description="There are no outstanding lab orders for your patients." icon="icon-flask" />
        ) : (
          <div className="table-container doctor-dashboard-table-container">
            <table className="data-table doctor-labs-table">
              <colgroup><col /><col /><col /><col /></colgroup>
              <thead><tr><th scope="col">Patient</th><th scope="col">Test</th><th scope="col">Ordered</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {pendingLabs.map((lab) => (
                  <tr key={lab.id}>
                    <td className="doctor-table-patient">{lab.patientName}</td>
                    <td>{lab.testName}</td>
                    <td className="doctor-table-date">{lab.orderedDate || '—'}</td>
                    <td><Badge status={lab.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default DoctorDashboard;
