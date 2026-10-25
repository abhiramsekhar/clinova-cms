import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { ErrorState } from '../../components/States';
import { DataTable } from '../../components/ui';
import { Format, formatTime, formatDate } from '../../utils/format';
import { useAuth } from '../../auth/AuthContext';
import './ReceptionDashboard.css';

const localDateString = (date = new Date()) => {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
};
const rows = (data) => (Array.isArray(data) ? data : (data?.results || []));

async function fetchAllRows(url, params) {
  const result = [];
  let page = 1;
  while (true) {
    const { data } = await apiClient.get(url, { params: { ...params, page } });
    result.push(...rows(data));
    if (!data?.next) return result;
    page += 1;
  }
}

export function ReceptionDashboard() {
  const { user, role } = useAuth();
  const [today, setToday] = useState(localDateString);
  useEffect(() => {
    const timer = setInterval(() => setToday(localDateString()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [selectedDate, setSelectedDate] = useState('');
  const scheduledDate = selectedDate || today;
  const [billFilter, setBillFilter] = useState('today');
  const [billDate, setBillDate] = useState(today);

  const scheduledQuery = useQuery({
    queryKey: ['receptionScheduledAppointments', scheduledDate],
    queryFn: () => fetchAllRows('/appointments/', { date: scheduledDate, page_size: 200 }),
    refetchInterval: 30_000,
  });
  const billParams = billFilter === 'all'
    ? { page_size: 200 }
    : { created_date: billFilter === 'today' ? today : billDate, page_size: 200 };
  const billsQuery = useQuery({
    queryKey: ['receptionBills', billFilter, billDate, today],
    queryFn: () => fetchAllRows('/bills/', billParams),
    refetchInterval: 30_000,
  });
  const appointments = rows(scheduledQuery.data);
  const countStatus = (status) => scheduledQuery.isLoading || scheduledQuery.error ? '—' : appointments.filter((item) => item.status === status).length;
  const kpis = [
    { label: 'Checked In', value: countStatus('CHECKED_IN'), icon: 'icon-users', color: 'var(--primary)' },
    { label: 'Scheduled', value: countStatus('SCHEDULED'), icon: 'icon-calendar', color: 'var(--warning, #D97706)' },
    { label: 'Completed', value: countStatus('COMPLETED'), icon: 'icon-check-circle', color: 'var(--success, #10B981)' },
  ];
  const bills = rows(billsQuery.data);
  const billTotal = bills.filter((bill) => bill.status !== 'CANCELLED').reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
  const appointmentColumns = [
    { key: 'tokenNumber', label: 'Token', width: '75px', sortable: true, render: (r) => <strong>#{r.tokenNumber || '-'}</strong> },
    { key: 'time', label: 'Time', width: '100px', sortable: true, render: (r) => formatTime(r.time) },
    { key: 'patientName', label: 'Patient', sortable: true, render: (r) => <div><strong>{r.patient?.name || 'Patient'}</strong><br /><code>{r.patient?.mrn || r.patient?.id || ''}</code></div> },
    { key: 'doctorName', label: 'Doctor', sortable: true, render: (r) => r.doctor?.name || 'Doctor' },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status} /> },
  ];

  return <div>
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
      <div className="page-header__info">
        <h1 className="text-page-title" style={{ margin: '0 0 .25rem' }}>Dashboard</h1>
        <p className="text-caption" style={{ margin: 0 }}>Welcome back, {Format.displayName(user?.staffName || user?.username, role)}</p>
      </div>
      <div className="page-header__actions" style={{ display: 'flex', gap: '.75rem' }}>
        <Link to="/reception/patients" className="btn btn--secondary"><Icon name="icon-user-plus" size={16} /> New Patient</Link>
        <Link to="/reception/appointments" className="btn btn--primary"><Icon name="icon-calendar" size={16} /> Book Appointment</Link>
      </div>
    </div>

    <p className="text-caption">Appointment counts for {formatDate(scheduledDate)} · All pages included</p>
    <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginBottom: '1.5rem' }}>
      {kpis.map((item) => <div key={item.label} className="glass card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="text-caption">{item.label}</span><Icon name={item.icon} size={20} color={item.color} /></div>
        <strong style={{ display: 'block', marginTop: '.4rem', fontSize: '1.7rem' }}>{item.value}</strong>
      </div>)}
    </div>

    <div className="reception-dashboard-grid">
      <div className="reception-dashboard-main">
        <section className="glass card reception-dashboard-card">
          <div className="reception-card-header">
            <div><h2 className="text-card-title" style={{ margin: 0 }}>{scheduledDate === today ? "Today's Appointments" : `Appointments — ${formatDate(scheduledDate)}`}</h2><p className="text-caption">Walk-ins and prior bookings for {formatDate(scheduledDate)} · {appointments.length} appointments · {new Set(appointments.map((item) => item.patient?.id)).size} patients · All statuses</p></div>
            <label className="reception-date-tool">Appointment date<input aria-label="Appointment date" type="date" className="form-input" value={scheduledDate} onChange={(e) => setSelectedDate(e.target.value === today ? '' : e.target.value)} /></label>
          </div>
          {scheduledQuery.error ? <ErrorState title="Unable to load appointments" error={scheduledQuery.error} onRetry={scheduledQuery.refetch} /> : <DataTable columns={appointmentColumns} data={rows(scheduledQuery.data)} isLoading={scheduledQuery.isLoading} emptyTitle="No appointments for this date" emptyMessage="Appointments are filtered by their scheduled date." perPage={10} defaultSort="time" />}
        </section>

      </div>

      <aside className="reception-dashboard-side">
        <section className="glass card reception-dashboard-card">
          <div className="reception-card-header">
            <h2 className="text-card-title" style={{ margin: 0 }}>Bills</h2>
            <div className="reception-card-tools">
              <select aria-label="Bill date filter" className="form-input" value={billFilter} onChange={(e) => setBillFilter(e.target.value)}>
                <option value="today">Today's Bills</option><option value="date">Select Date</option><option value="all">All Bills</option>
              </select>
              {billFilter === 'date' && <input aria-label="Bill date" type="date" className="form-input" value={billDate} onChange={(e) => setBillDate(e.target.value)} />}
            </div>
          </div>
          <p className="text-caption" style={{ margin: '0 0 .75rem' }}>{bills.length} bill(s) · {Format.money(billTotal)}</p>
          {billsQuery.error ? <ErrorState title="Unable to load bills" error={billsQuery.error} onRetry={billsQuery.refetch} /> : bills.length === 0 ? <p className="text-caption">No bills found for this selection.</p> : <div className="reception-scroll-list">{bills.map((bill) => <div className="reception-bill-row" key={bill.id}>
            <div className="reception-bill-row-top"><strong>{bill.patientName}</strong><Badge status={bill.status} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem' }}><span className="text-body-sm">{bill.id}{billFilter === 'all' ? ` · ${bill.billDate}` : ''}</span><strong>{Format.money(bill.totalAmount)}</strong></div>
          </div>)}</div>}
          <Link to="/reception/billing" className="text-link text-body-sm" style={{ display: 'inline-block', marginTop: '.75rem' }}>Open billing</Link>
        </section>


      </aside>
    </div>
  </div>;
}

export default ReceptionDashboard;
