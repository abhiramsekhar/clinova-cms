import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { LoadingState, ErrorState } from '../../components/States';
import { formatTime } from '../../utils/format';

export function ReceptionDashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch } = useQuery({
    queryKey: ['receptionDashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard/reception/');
      return res.data;
    },
  });

  const { data: appointmentsData, isLoading: apptsLoading } = useQuery({
    queryKey: ['receptionAppointments'],
    queryFn: async () => {
      const res = await apiClient.get('/appointments/');
      return res.data?.results || res.data || [];
    },
  });

  if (statsLoading || apptsLoading) {
    return <LoadingState message="Loading reception desk dashboard..." />;
  }

  if (statsError) {
    return <ErrorState title="Failed to load reception dashboard" error={statsError} onRetry={refetch} />;
  }

  const kpis = [
    { label: 'Scheduled Today', value: stats?.scheduled ?? 0, icon: 'icon-calendar', color: 'var(--warning)' },
    { label: 'Checked In', value: stats?.checkedIn ?? 0, icon: 'icon-check-circle', color: 'var(--primary)' },
    { label: 'Completed', value: stats?.completed ?? 0, icon: 'icon-shield', color: 'var(--success)' },
    { label: 'Unpaid Invoices', value: stats?.unpaidBills ?? 0, icon: 'icon-receipt', color: 'var(--danger)' },
  ];

  const apptsList = Array.isArray(appointmentsData) ? appointmentsData : [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title">Reception & Front Desk</h1>
          <p className="text-caption">Patient registration, appointment scheduling, and fee collection</p>
        </div>
        <div className="page-header__actions">
          <Link to="/reception/patients" className="btn btn--secondary">
            <Icon name="icon-users" size={16} />
            <span>New Patient</span>
          </Link>
          <Link to="/reception/appointments" className="btn btn--primary">
            <Icon name="icon-calendar" size={16} />
            <span>Book Appointment</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
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

      {/* Recent Appointments */}
      <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Recent Front Desk Appointments
          </h3>
          <Link to="/reception/appointments" className="btn btn--ghost btn--sm">
            View All
          </Link>
        </div>

        {apptsList.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 0' }}>
            No appointments on record.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Patient</th>
                  <th>MRN</th>
                  <th>Doctor</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {apptsList.slice(0, 10).map((appt) => (
                  <tr key={appt.id}>
                    <td><strong>#{appt.tokenNumber || '-'}</strong></td>
                    <td style={{ fontWeight: 600 }}>{appt.patientName || appt.patient?.name || 'Patient'}</td>
                    <td><code>{appt.patientMrn || appt.patient?.mrn || '-'}</code></td>
                    <td>{appt.doctorName || 'Doctor'}</td>
                    <td>{formatTime(appt.slotTime || appt.appointmentTime)}</td>
                    <td>
                      <Badge status={appt.status} />
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

export default ReceptionDashboard;
