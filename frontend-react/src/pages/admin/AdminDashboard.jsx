import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../api/resources';
import Icon from '../../components/Icon';
import { LoadingState, ErrorState } from '../../components/States';
import { formatPaise } from '../../utils/format';

export function AdminDashboard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: dashboardApi.admin,
  });

  if (isLoading) {
    return <LoadingState message="Loading administrator dashboard..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load admin dashboard" error={error} onRetry={refetch} />;
  }

  const kpis = [
    { label: 'Active Staff', value: data?.staffCount ?? '-', icon: 'icon-users', color: 'var(--teal-700)' },
    { label: 'Active Doctors', value: data?.activeDoctors ?? '-', icon: 'icon-users', color: 'var(--info)' },
    { label: "Today's Appointments", value: data?.todayAppointments ?? '-', icon: 'icon-calendar', color: 'var(--primary)' },
    { label: 'Pending Lab Tests', value: data?.pendingLabs ?? '-', icon: 'icon-flask', color: 'var(--warning)' },
    { label: 'Medicine Alerts', value: data?.lowStockMedicines ?? '-', icon: 'icon-alert-triangle', color: 'var(--danger)' },
    { label: 'Total Revenue', value: formatPaise(data?.totalRevenuePaise ?? 0), icon: 'icon-receipt', color: 'var(--success)' },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title">Executive Dashboard</h1>
          <p className="text-caption">Clinic operations, performance indicators, and financial overview</p>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {kpis.map((kpi, idx) => (
          <div key={idx} className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--muted)' }}>{kpi.label}</span>
              <div style={{ color: kpi.color, opacity: 0.9 }}>
                <Icon name={kpi.icon} size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminDashboard;
