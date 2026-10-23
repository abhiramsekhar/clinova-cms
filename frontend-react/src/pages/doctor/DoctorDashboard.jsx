import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { LoadingState, ErrorState } from '../../components/States';
import { formatTime } from '../../utils/format';

export function DoctorDashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['doctorDashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard/doctor/');
      return res.data;
    },
  });

  const { data: appointmentsData, isLoading: apptsLoading } = useQuery({
    queryKey: ['doctorAppointmentsToday'],
    queryFn: async () => {
      const res = await apiClient.get('/appointments/?doctor=me');
      return res.data?.results || res.data || [];
    },
  });

  if (statsLoading || apptsLoading) {
    return <LoadingState message="Loading doctor dashboard..." />;
  }

  if (statsError) {
    return <ErrorState title="Failed to load doctor dashboard" error={statsError} onRetry={refetchStats} />;
  }

  const kpis = [
    { label: "Today's Appointments", value: stats?.todayAppointments ?? 0, icon: 'icon-calendar', color: 'var(--primary)' },
    { label: 'Pending Lab Orders', value: stats?.pendingLabs ?? 0, icon: 'icon-flask', color: 'var(--warning)' },
    { label: 'Active Prescriptions', value: stats?.activePrescriptions ?? 0, icon: 'icon-clipboard-list', color: 'var(--teal-700)' },
  ];

  const apptsList = Array.isArray(appointmentsData) ? appointmentsData : [];

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

      {/* KPI Cards */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {kpis.map((kpi, idx) => (
          <div key={idx} className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--muted)' }}>{kpi.label}</span>
              <div style={{ color: kpi.color }}>
                <Icon name={kpi.icon} size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Today's Appointments Section */}
      <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Scheduled Consultations
          </h3>
          <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>
            {apptsList.length} appointment{apptsList.length !== 1 ? 's' : ''}
          </span>
        </div>

        {apptsList.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 0' }}>
            No appointments scheduled for today.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Time / Token</th>
                  <th>Patient Name</th>
                  <th>MRN</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {apptsList.slice(0, 10).map((appt) => (
                  <tr key={appt.id}>
                    <td>
                      <strong>{formatTime(appt.slotTime || appt.appointmentTime)}</strong>
                      {appt.tokenNumber && <span style={{ marginLeft: '0.5rem', color: 'var(--muted)', fontSize: '0.8rem' }}>(#{appt.tokenNumber})</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{appt.patientName || appt.patient?.name || 'Patient'}</td>
                    <td><code>{appt.patientMrn || appt.patient?.mrn || '-'}</code></td>
                    <td>
                      <Badge status={appt.status} />
                    </td>
                    <td>
                      <Link to={`/doctor/consultation?appointmentId=${appt.id}`} className="btn btn--secondary btn--sm">
                        Consult
                      </Link>
                    </td>
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
