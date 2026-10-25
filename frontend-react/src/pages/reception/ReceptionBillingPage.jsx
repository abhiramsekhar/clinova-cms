import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { billsApi } from '../../api/resources';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { Modal, DataTable, openPrintView } from '../../components/ui';
import { ErrorState } from '../../components/States';
import { Format, formatDate, formatDateTime, formatTime } from '../../utils/format';

const localDateString = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const latestPayment = (bill) => (bill.payments || []).slice().sort((a, b) =>
  `${b.paymentDate || ''}${b.createdAt || ''}`.localeCompare(`${a.paymentDate || ''}${a.createdAt || ''}`)
)[0];

const TABS = [
  { id: 'scheduled', label: "Today's Billing" },
  { id: 'past', label: 'Past Billing Records' },
];

export function ReceptionBillingPage() {
  const today = localDateString();
  const yesterdayDate = new Date(`${today}T12:00:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDateString(yesterdayDate);
  const [view, setView] = useState('scheduled');
  const [selectedDate, setSelectedDate] = useState('');
  const [search, setSearch] = useState('');
  const [viewBill, setViewBill] = useState(null);

  const queryParams = {
    page_size: 200,
    status: 'PAID',
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(view === 'scheduled' ? { appointment_date: today } : {}),
    ...(view === 'past' && selectedDate ? { paid_date: selectedDate } : {}),
  };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['receptionPaidBills', view, selectedDate, search.trim(), today],
    queryFn: async () => {
      const response = await billsApi.list(queryParams);
      return Array.isArray(response) ? response : (response?.results || []);
    },
  });
  const bills = Array.isArray(data) ? data : [];

  const printInvoice = (bill) => {
    const items = (bill.items || []).map((item) => `
      <tr><td>${escapeHtml(item.description || 'Clinical service')}</td>
      <td>${escapeHtml((item.itemType || item.item_type || 'SERVICE').replaceAll('_', ' '))}</td>
      <td style="text-align:right">${Format.money(item.amount)}</td></tr>`).join('');
    const payment = latestPayment(bill);
    const bookingMode = bill.bookingMode === 'WALK_IN' ? 'Walk-in' : bill.bookingMode === 'PRIOR' ? 'Prior booking' : '—';
    const content = `
      <section>
        <h1 style="margin:0 0 4px">Paid Invoice</h1>
        <p style="margin:0 0 20px;color:#64748b">Clinova Healthcare · MG Road, Ernakulam, Kerala · Contact: 0484-2345678</p>
        <table><tbody>
          <tr><th>Invoice</th><td>${escapeHtml(bill.id)}</td><th>Invoice date</th><td>${escapeHtml(formatDate(bill.billDate || bill.createdAt))}</td></tr>
          <tr><th>Payment date</th><td>${escapeHtml(formatDate(payment?.paymentDate))}</td><th>Payment method</th><td>${escapeHtml(payment?.paymentMethod || payment?.method || '—')}</td></tr>
          <tr><th>Patient</th><td>${escapeHtml(bill.patientName || 'Patient')}</td><th>MRN</th><td>${escapeHtml(bill.patientMrn || '—')}</td></tr>
          <tr><th>Doctor</th><td>${escapeHtml(bill.doctorName || '—')}</td><th>Department</th><td>${escapeHtml(bill.departmentName || '—')}</td></tr>
          <tr><th>Appointment</th><td>${escapeHtml(formatDate(bill.appointmentDate))} ${escapeHtml(formatTime(bill.appointmentTime))}</td><th>Booking mode</th><td>${bookingMode}</td></tr>
        </tbody></table>
        <table><thead><tr><th>Charge</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead><tbody>
          ${items || '<tr><td colspan="3">No item details recorded</td></tr>'}
        </tbody><tfoot><tr><th colspan="2">Total paid</th><th style="text-align:right">${Format.money(bill.totalAmount)}</th></tr></tfoot></table>
        <p style="text-align:right"><strong>Payment status: PAID</strong></p>
      </section>`;
    openPrintView(`Invoice ${bill.id}`, content);
  };

  const columns = [
    { key: 'id', label: 'Invoice #', width: '130px', sortable: true, render: (bill) => <strong style={{ color: 'var(--primary)' }}>{bill.id}</strong> },
    { key: 'billDate', label: 'Invoice Date', sortable: true, render: (bill) => formatDate(bill.billDate || bill.createdAt) },
    { key: 'appointmentDate', label: 'Appointment', sortable: true, render: (bill) => bill.appointmentDate ? <>{formatDate(bill.appointmentDate)}<br /><small>{formatTime(bill.appointmentTime)}</small></> : '—' },
    { key: 'patientName', label: 'Patient / MRN', sortable: true, render: (bill) => <><strong>{bill.patientName || 'Patient'}</strong><br /><code>{bill.patientMrn || '—'}</code></> },
    { key: 'doctorName', label: 'Doctor', sortable: true, render: (bill) => <>{bill.doctorName || '—'}{bill.departmentName && <><br /><small>{bill.departmentName}</small></>}</> },
    { key: 'totalAmount', label: 'Paid', sortable: true, render: (bill) => <strong>{Format.money(bill.totalAmount)}</strong> },
    { key: 'status', label: 'Status', render: () => <Badge status="PAID" /> },
    { key: 'actions', label: 'Invoice', width: '120px', render: (bill) => <button type="button" className="btn btn--secondary btn--sm" onClick={() => setViewBill(bill)}>View / Print</button> },
  ];

  return <div>
    <div className="page-header" style={{ marginBottom: '1.25rem' }}>
      <div className="page-header__info">
        <h1 className="text-page-title" style={{ margin: '0 0 .25rem' }}>Billing &amp; Invoices</h1>
        <p className="text-caption" style={{ margin: 0, color: 'var(--muted)' }}>Paid invoices and appointment billing history</p>
      </div>
    </div>

    <div className="glass card" style={{ padding: 0, borderRadius: 12, overflow: 'hidden' }}>
      <nav aria-label="Billing views" style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setView(tab.id)} aria-current={view === tab.id ? 'page' : undefined}
          className="btn btn--ghost" style={{ borderRadius: 0, borderBottom: view === tab.id ? '3px solid var(--primary)' : '3px solid transparent', color: view === tab.id ? 'var(--primary)' : 'var(--muted)', fontWeight: view === tab.id ? 700 : 500, padding: '1rem 1.25rem' }}>
          {tab.label}
        </button>)}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.75rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div className="search-bar" style={{ flex: '1 1 300px', maxWidth: 460, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span className="search-bar__icon" style={{ display: 'flex', alignItems: 'center' }}><Icon name="icon-search" size={16} /></span>
          <input className="search-bar__input" style={{ paddingRight: '44px' }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, MRN, invoice..." aria-label="Search paid invoices" />
          {search && <button type="button" className="btn btn--ghost btn--icon" aria-label="Clear search" style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSearch('')}><Icon name="icon-x" size={12} /></button>}
        </div>
        {view === 'past' && <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span>Paid date</span>
          <input className="form-input" type="date" value={selectedDate} max={yesterday} onChange={(event) => setSelectedDate(event.target.value)} aria-label="Choose past invoice date" />
        </label>}
        <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>
          {view === 'scheduled' ? `Appointments scheduled for ${formatDate(today)}` : selectedDate ? `Payments recorded on ${formatDate(selectedDate)}` : 'Select a previous payment date'}
        </span>
      </div>

      <div style={{ padding: '1rem 1.25rem' }}>
        {error ? <ErrorState title="Unable to load paid invoices" error={error} onRetry={refetch} /> : view === 'past' && !selectedDate ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>Choose a date to view paid invoices from that day.</div>
        ) : <DataTable columns={columns} data={bills} isLoading={isLoading} emptyTitle="No paid invoices found" emptyMessage="There are no paid invoices for this view and search." perPage={10} defaultSort="billDate" />}
      </div>
    </div>

    {viewBill && <Modal isOpen onClose={() => setViewBill(null)} title={`Paid Invoice ${viewBill.id}`} size="lg">
      <article style={{ padding: '1.25rem', background: '#fff', color: '#17343A', border: '1px solid #dbe5e7', borderRadius: 10 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', borderBottom: '2px solid #05668D', paddingBottom: '1rem' }}>
          <div><h2 style={{ margin: 0, color: '#05668D' }}>Clinova Healthcare</h2><div>MG Road, Ernakulam, Kerala · Contact: 0484-2345678</div><div>Paid invoice</div></div>
          <div style={{ textAlign: 'right' }}><strong>#{viewBill.id}</strong><br />Invoice: {formatDate(viewBill.billDate || viewBill.createdAt)}<br /><Badge status="PAID" /></div>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '.75rem', padding: '1rem 0' }}>
          <div><small>Patient / MRN</small><br /><strong>{viewBill.patientName || 'Patient'} / {viewBill.patientMrn || '—'}</strong></div>
          <div><small>Doctor / Department</small><br /><strong>{viewBill.doctorName || '—'} / {viewBill.departmentName || '—'}</strong></div>
          <div><small>Appointment</small><br /><strong>{viewBill.appointmentDate ? `${formatDate(viewBill.appointmentDate)} at ${formatTime(viewBill.appointmentTime)}` : '—'}</strong></div>
          <div><small>Booking mode</small><br /><strong>{viewBill.bookingMode === 'WALK_IN' ? 'Walk-in' : viewBill.bookingMode === 'PRIOR' ? 'Prior booking' : '—'}</strong></div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ textAlign: 'left' }}>Charge</th><th style={{ textAlign: 'left' }}>Type</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>
          {(viewBill.items || []).map((item) => <tr key={item.id || item.billItemId || item.description}><td>{item.description}</td><td>{(item.itemType || item.item_type || 'SERVICE').replaceAll('_', ' ')}</td><td style={{ textAlign: 'right' }}>{Format.money(item.amount)}</td></tr>)}
        </tbody></table>
        <div style={{ marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px solid #dbe5e7', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span>Payment: <strong>{formatDate(latestPayment(viewBill)?.paymentDate)} · {latestPayment(viewBill)?.paymentMethod || latestPayment(viewBill)?.method || '—'}</strong></span>
          <span>Total paid: <strong style={{ color: '#05668D', fontSize: '1.15rem' }}>{Format.money(viewBill.totalAmount)}</strong></span>
        </div>
      </article>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', marginTop: '1rem' }}>
        <button type="button" className="btn btn--secondary" onClick={() => printInvoice(viewBill)}><Icon name="icon-printer" size={16} /> Print Invoice</button>
        <button type="button" className="btn btn--primary" onClick={() => setViewBill(null)}>Close</button>
      </div>
    </Modal>}
  </div>;
}

export default ReceptionBillingPage;
