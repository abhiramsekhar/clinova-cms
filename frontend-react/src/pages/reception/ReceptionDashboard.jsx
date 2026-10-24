import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { LoadingState, ErrorState } from '../../components/States';
import { DataTable } from '../../components/ui';
import { Format, formatTime } from '../../utils/format';
import { useAuth } from '../../auth/AuthContext';

function localDateString(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 10);
}

export function ReceptionDashboard() {
  const { user, role } = useAuth();

  const { data: stats, isLoading: statsLoading, error: statsError, refetch } = useQuery({
    queryKey: ['receptionDashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard/reception/');
      return res.data;
    },
  });

  const { data: appointmentsData, isLoading: apptsLoading, error: apptsError, refetch: refetchAppts } = useQuery({
    queryKey: ['receptionAppointmentsToday'],
    queryFn: async () => {
      const todayStr = localDateString();
      const res = await apiClient.get('/appointments/', { params: { date: todayStr } });
      return res.data?.results || res.data || [];
    },
  });

  const { data: billsData, isLoading: billsLoading, error: billsError, refetch: refetchBills } = useQuery({
    queryKey: ['receptionRecentBills'],
    queryFn: async () => {
      const res = await apiClient.get('/bills/');
      return res.data?.results || res.data || [];
    },
  });

  if (statsLoading || apptsLoading || billsLoading) {
    return <LoadingState message="Loading reception desk dashboard..." />;
  }

  if (statsError) {
    return <ErrorState title="Failed to load reception dashboard" error={statsError} onRetry={refetch} />;
  }

  const kpis = [
    { label: 'Checked In', value: stats?.checkedIn ?? 0, icon: 'icon-users', color: 'var(--primary)', bg: 'rgba(5, 102, 141, 0.12)' },
    { label: 'Scheduled Today', value: stats?.scheduled ?? 0, icon: 'icon-calendar', color: 'var(--warning, #D97706)', bg: 'rgba(217, 119, 6, 0.12)' },
    { label: 'Completed Today', value: stats?.completed ?? 0, icon: 'icon-check-circle', color: 'var(--success, #10B981)', bg: 'rgba(16, 185, 129, 0.12)' },
    { label: 'Unpaid Invoices', value: stats?.unpaidBills ?? 0, icon: 'icon-file-text', color: 'var(--danger, #EF4444)', bg: 'rgba(239, 68, 68, 0.12)' },
  ];

  const apptsList = Array.isArray(appointmentsData) ? appointmentsData : [];
  const billsList = Array.isArray(billsData) ? billsData.slice(0, 10) : [];

  const columns = [
    {
      key: 'tokenNumber',
      label: 'Token',
      width: '90px',
      sortable: true,
      render: (r) => <strong>#{r.tokenNumber || '-'}</strong>,
    },
    {
      key: 'time',
      label: 'Time',
      width: '130px',
      sortable: true,
      render: (r) => (
        <div>
          <div>{formatTime(r.slotTime || r.time || r.appointmentTime)}</div>
          {r.mode && (
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {r.mode === 'WALK_IN' ? 'Walk-in' : 'Prior'}
            </span>
          )}
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
      render: (r) => r.doctorName || r.doctor?.name || 'Doctor',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => <Badge status={r.status} />,
    },
  ];

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <div className="page-header__info">
          <h1 className="text-page-title" style={{ margin: '0 0 0.25rem 0' }}>Dashboard</h1>
          <p className="text-caption" style={{ margin: 0, color: 'var(--muted)' }}>
            Welcome back, {Format.displayName(user?.staffName || user?.username, role)}
          </p>
        </div>
        <div className="page-header__actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/reception/patients" className="btn btn--secondary">
            <Icon name="icon-user-plus" size={16} />
            <span>New Patient</span>
          </Link>
          <Link to="/reception/appointments" className="btn btn--primary">
            <Icon name="icon-calendar" size={16} />
            <span>Book Appointment</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {kpis.map((kpi, idx) => (
          <div key={idx} className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--muted)' }}>{kpi.label}</span>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: kpi.bg, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={kpi.icon} size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* 2-Column Section: Today's Appointments (2fr) + Recent Bills (1fr) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Appointments */}
        <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px', flex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Today's Appointments
            </h3>
            <Link to="/reception/appointments" className="btn btn--ghost btn--sm">
              View All
            </Link>
          </div>
          {apptsError ? (
            <ErrorState title="Unable to load today's appointments" error={apptsError} onRetry={refetchAppts} />
          ) : (
            <DataTable
              columns={columns}
              data={apptsList}
              emptyTitle="No appointments scheduled for today"
              emptyIcon="icon-calendar"
              perPage={10}
              defaultSort="time"
            />
          )}
        </div>

        {/* Right: Recent Bills */}
        <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Recent Bills
            </h3>
            <Link to="/reception/billing" className="btn btn--ghost btn--sm">
              View All
            </Link>
          </div>

          {billsError ? (
            <ErrorState title="Unable to load recent bills" error={billsError} onRetry={refetchBills} />
          ) : billsList.length === 0 ? (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '1.5rem 0' }}>
              No recent bills found.
            </p>
          ) : (
            <div>
              {billsList.map((bill) => (
                <div
                  key={bill.id || bill.billId}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    padding: '0.75rem 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>
                      {bill.patientName || bill.patient?.name || 'Patient'}
                    </span>
                    <Badge status={bill.status} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    <span>{bill.billNumber || bill.id}</span>
                    <strong style={{ color: 'var(--text)' }}>
                      {Format.money(bill.totalAmount || bill.total || bill.amount)}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReceptionDashboard;
