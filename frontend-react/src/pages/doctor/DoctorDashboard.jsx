import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { appointmentsApi, dashboardApi } from '../../api/resources';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';
import { formatTime } from '../../utils/format';

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
    <div>
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title">Doctor Consultation Dashboard</h1>
          <p className="text-caption">Today's clinical schedule and pending diagnostic tasks</p>
        </div>
        <div className="page-header__actions">
          <Link to="/doctor/appointments" className="btn btn--primary">
            <Icon name="icon-calendar" size={16} />
            <span>View Full Schedule</span>
          </Link>
        </div>
      </div>

      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--muted)' }}>{kpi.label}</span>
              <div style={{ color: kpi.color }}><Icon name={kpi.icon} size={20} /></div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>{kpi.value ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Today's Appointments</h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
          </span>
        </div>
        {appointmentsError ? (
          <ErrorState title="Failed to load today's appointments" error={appointmentsError} onRetry={refetchAppointments} />
        ) : appointments.length === 0 ? (
          <EmptyState title="No appointments today" description="Your schedule has no appointments for today." icon="icon-calendar" />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Time / Token</th><th>Patient Name</th><th>MRN</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {appointments.slice(0, 10).map((appt) => {
                  const patientName = appt.patientName || appt.patient?.name || 'Patient';
                  const patientMrn = appt.patientMrn || appt.patient?.mrn || '-';
                  const canConsult = ['CHECKED_IN', 'IN_PROGRESS'].includes(appt.status);
                  return (
                    <tr key={appt.id}>
                      <td>
                        <strong>{formatTime(appt.time)}</strong>
                        {appt.tokenNumber != null && <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontSize: '0.8rem' }}>(#{appt.tokenNumber})</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>{patientName}</td>
                      <td><code>{patientMrn}</code></td>
                      <td><Badge status={appt.status} /></td>
                      <td>
                        {canConsult ? (
                          <Link to={`/doctor/consultation?appointmentId=${encodeURIComponent(appt.id)}`} className="btn btn--secondary btn--sm">Consult</Link>
                        ) : appt.status === 'SCHEDULED' ? (
                          <span style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>Awaiting check-in</span>
                        ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Pending Lab Results</h3>
          <Link to="/doctor/lab-orders" className="btn btn--secondary btn--sm">View Lab Orders</Link>
        </div>
        {pendingLabs.length === 0 ? (
          <EmptyState title="No pending lab results" description="There are no outstanding lab orders for your patients." icon="icon-flask" />
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Patient</th><th>Test</th><th>Ordered</th><th>Status</th></tr></thead>
              <tbody>
                {pendingLabs.map((lab) => (
                  <tr key={lab.id}>
                    <td style={{ fontWeight: 600 }}>{lab.patientName}</td>
                    <td>{lab.testName}</td>
                    <td>{lab.orderedDate || '—'}</td>
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
