import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { billsApi } from '../../api/resources';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { Modal, FormField, DataTable, useToast, openPrintView } from '../../components/ui';
import { Format, formatDate, formatDateTime } from '../../utils/format';

export function ReceptionBillingPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected bill for Invoice view modal
  const [viewBill, setViewBill] = useState(null);

  // Selected bill for Receive Payment modal
  const [payBill, setPayBill] = useState(null);
  const [payAmountRupees, setPayAmountRupees] = useState('');
  const [payMethod, setPayMethod] = useState('UPI');

  // Fetch Bills
  const { data: billsData, isLoading, refetch } = useQuery({
    queryKey: ['billsList', statusFilter],
    queryFn: async () => {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await billsApi.list(params);
      return Array.isArray(res) ? res : (res?.results || []);
    },
  });

  const billsList = Array.isArray(billsData) ? billsData : [];

  // Filtered Bills by search
  const filteredBills = useMemo(() => {
    if (!searchQuery.trim()) return billsList;
    const q = searchQuery.toLowerCase().trim();
    return billsList.filter(
      (b) =>
        (b.id && b.id.toLowerCase().includes(q)) ||
        (b.patientName && b.patientName.toLowerCase().includes(q)) ||
        (b.patientMrn && b.patientMrn.toLowerCase().includes(q))
    );
  }, [billsList, searchQuery]);

  // Payment Mutation
  const paymentMutation = useMutation({
    mutationFn: async ({ billId, amountPaise, method }) => {
      return await billsApi.receivePayment(billId, {
        amount: amountPaise,
        method,
      });
    },
    onSuccess: () => {
      toast.success('Payment received successfully.');
      setPayBill(null);
      queryClient.invalidateQueries(['billsList']);
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to record payment.';
      toast.error(msg);
    },
  });

  const handleOpenPayModal = (bill) => {
    setPayBill(bill);
    const balPaise = bill.balanceDue != null ? bill.balanceDue : (bill.totalAmount - bill.paidAmount);
    setPayAmountRupees((balPaise / 100).toFixed(2));
    setPayMethod('UPI');
  };

  const handleReceivePaymentSubmit = (e) => {
    e.preventDefault();
    if (!payBill) return;

    const amt = parseFloat(payAmountRupees);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }

    const amtPaise = Math.round(amt * 100);
    const balPaise = payBill.balanceDue != null ? payBill.balanceDue : (payBill.totalAmount - payBill.paidAmount);

    if (amtPaise > balPaise) {
      toast.error(`Payment cannot exceed the balance due of ${Format.money(balPaise)}.`);
      return;
    }

    paymentMutation.mutate({
      billId: payBill.id || payBill.bill_id,
      amountPaise: amtPaise,
      method: payMethod,
    });
  };

  const handlePrint = (bill) => {
    const bal = bill.status === 'CANCELLED' ? 0 : (bill.balanceDue != null ? bill.balanceDue : (bill.totalAmount - bill.paidAmount));
    const itemsHtml = (bill.items || []).map((item) => `
      <tr>
        <td>${item.description || item.item_type || 'Clinical Service'}</td>
        <td><span style="font-size: 10pt; color: #4b5563;">${(item.itemType || item.item_type || 'SERVICE').toUpperCase()}</span></td>
        <td style="text-align: right;">${Format.money(item.amount)}</td>
      </tr>
    `).join('');

    const paymentsHtml = (bill.payments || []).map((p) => `
      <div style="display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 4px;">
        <span>${formatDateTime(p.paymentDate || p.createdAt || p.created_at)} • ${p.paymentMethod || p.method}</span>
        <strong>${Format.money(p.amount)}</strong>
      </div>
    `).join('');

    const contentHtml = `
      <div style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
          <div>
            <div style="font-size: 10pt; color: #6b7280;">Billed To:</div>
            <div style="font-size: 13pt; font-weight: 700; color: #111827;">${bill.patientName || 'Patient'}</div>
            <div style="font-size: 10pt; color: #4b5563;">MRN: <strong>${bill.patientMrn || '-'}</strong></div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10pt; color: #6b7280;">Invoice Details:</div>
            <div style="font-size: 12pt; font-weight: 700;"># ${bill.id}</div>
            <div style="font-size: 10pt; color: #4b5563;">Date: ${formatDate(bill.billDate || bill.createdAt)}</div>
            <div style="margin-top: 4px;"><span style="background: #e5e7eb; padding: 2px 8px; border-radius: 4px; font-size: 9pt; font-weight: 600;">${bill.status}</span></div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead>
            <tr style="border-bottom: 2px solid #05668D; background: #f3f4f6;">
              <th style="text-align: left; padding: 8px;">Description</th>
              <th style="text-align: left; padding: 8px;">Category</th>
              <th style="text-align: right; padding: 8px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="3" style="padding: 12px; text-align: center;">No itemized breakdown</td></tr>'}
          </tbody>
        </table>

        ${paymentsHtml ? `
          <div style="margin: 20px 0; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
            <div style="font-weight: 600; font-size: 10pt; margin-bottom: 8px; color: #374151;">Payment Transactions:</div>
            ${paymentsHtml}
          </div>
        ` : ''}

        <div style="width: 280px; margin-left: auto; margin-top: 20px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <span>Subtotal:</span>
            <strong>${Format.money(bill.totalAmount)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #059669;">
            <span>Amount Paid:</span>
            <strong>${Format.money(bill.paidAmount)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid #111827; margin-top: 4px; font-size: 12pt;">
            <span>Balance Due:</span>
            <strong style="color: ${bal > 0 ? '#dc2626' : '#111827'};">${Format.money(bal)}</strong>
          </div>
        </div>
      </div>
    `;

    openPrintView(`Invoice — ${bill.id}`, contentHtml);
  };

  // Columns for DataTable
  const columns = [
    {
      key: 'id',
      label: 'Invoice #',
      width: '120px',
      sortable: true,
      render: (r) => <strong style={{ color: 'var(--primary)' }}>{r.id}</strong>,
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (r) => formatDate(r.billDate || r.createdAt),
    },
    {
      key: 'patientName',
      label: 'Patient',
      sortable: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.patientName || 'Patient'}</div>
          {r.patientMrn && (
            <code style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{r.patientMrn}</code>
          )}
        </div>
      ),
    },
    {
      key: 'totalAmount',
      label: 'Total Amount',
      sortable: true,
      render: (r) => <strong>{Format.money(r.totalAmount)}</strong>,
    },
    {
      key: 'balance',
      label: 'Balance',
      sortable: false,
      render: (r) => {
        const bal = r.status === 'CANCELLED' ? 0 : (r.balanceDue != null ? r.balanceDue : (r.totalAmount - r.paidAmount));
        return bal > 0 ? (
          <span style={{ color: 'var(--danger, #EF4444)', fontWeight: 600 }}>
            {Format.money(bal)}
          </span>
        ) : (
          <span style={{ color: 'var(--muted)' }}>-</span>
        );
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
      width: '150px',
      render: (r) => {
        const bal = r.status === 'CANCELLED' ? 0 : (r.balanceDue != null ? r.balanceDue : (r.totalAmount - r.paidAmount));
        const canPay = (r.status === 'UNPAID' || r.status === 'PARTIAL') && bal > 0;

        return (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setViewBill(r)}
            >
              View
            </button>
            {canPay && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => handleOpenPayModal(r)}
              >
                Pay
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="page-header__info">
          <h1 className="text-page-title" style={{ margin: '0 0 0.25rem 0' }}>Billing & Invoices</h1>
          <p className="text-caption" style={{ margin: 0, color: 'var(--muted)' }}>
            Track patient invoices, process payments, and print receipts
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '280px', maxWidth: '420px' }}>
          <div className="search-bar" style={{ width: '100%' }}>
            <span className="search-bar__icon">
              <Icon name="icon-search" size={16} />
            </span>
            <input
              type="text"
              className="search-bar__input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice #, patient name, MRN..."
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: 0 }}
              >
                <Icon name="icon-x" size={12} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: '180px', padding: '0.5rem 0.75rem' }}
          >
            <option value="">All Statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled / Refunded</option>
          </select>
        </div>
      </div>

      {/* Bills DataTable */}
      <div className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
        <DataTable
          columns={columns}
          data={filteredBills}
          isLoading={isLoading}
          emptyTitle="No invoices found"
          emptyMessage="No billing records found matching your criteria."
          perPage={10}
          defaultSort="createdAt"
        />
      </div>

      {/* Invoice View Modal */}
      {viewBill && (
        <Modal
          isOpen={!!viewBill}
          onClose={() => setViewBill(null)}
          title={`Invoice ${viewBill.id}`}
          size="lg"
        >
          <div>
            <div style={{ padding: '1.5rem', background: '#ffffff', borderRadius: '8px', color: '#17343A' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #e5e7eb', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--navy-900, #05668D)', margin: '0 0 0.25rem 0' }}>
                    Clinova Healthcare
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
                    MG Road, Ernakulam, Kerala • Contact: 0484-2345678
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>INVOICE</div>
                  <div style={{ fontSize: '0.9rem', color: '#05668D', fontWeight: 600 }}>#{viewBill.id}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Date: {formatDate(viewBill.billDate || viewBill.createdAt)}
                  </div>
                  <div style={{ marginTop: '0.25rem' }}>
                    <Badge status={viewBill.status} />
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Bill To:
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                  {viewBill.patientName || 'Patient'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
                  MRN: <strong>{viewBill.patientMrn || '-'}</strong>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #d1d5db', textAlign: 'left', background: '#f9fafb' }}>
                    <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem', color: '#4b5563' }}>Description</th>
                    <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem', color: '#4b5563' }}>Type</th>
                    <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem', color: '#4b5563', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewBill.items || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af' }}>
                        Standard Medical Consultation & Services
                      </td>
                    </tr>
                  ) : (
                    viewBill.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.9rem' }}>{it.description}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', background: '#e5e7eb', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                            {(it.itemType || it.item_type || 'SERVICE').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>
                          {Format.money(it.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Payments History */}
              {(viewBill.payments || []).length > 0 && (
                <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: '0.5rem' }}>
                    Payment History:
                  </div>
                  {viewBill.payments.map((p, pIdx) => (
                    <div key={pIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.2rem 0' }}>
                      <span style={{ color: '#4b5563' }}>
                        {formatDateTime(p.paymentDate || p.createdAt || p.created_at)} • {p.paymentMethod || p.method}
                      </span>
                      <strong style={{ color: '#059669' }}>
                        {Format.money(p.amount)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div style={{ width: '260px', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.9rem' }}>
                  <span style={{ color: '#4b5563' }}>Subtotal:</span>
                  <strong>{Format.money(viewBill.totalAmount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.9rem', color: '#059669' }}>
                  <span>Amount Paid:</span>
                  <strong>{Format.money(viewBill.paidAmount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderTop: '2px solid #e5e7eb', marginTop: '0.5rem', fontSize: '1.1rem' }}>
                  <span>Balance Due:</span>
                  <strong style={{ color: (viewBill.balanceDue || (viewBill.totalAmount - viewBill.paidAmount)) > 0 ? '#dc2626' : '#111827' }}>
                    {Format.money(viewBill.status === 'CANCELLED' ? 0 : (viewBill.balanceDue != null ? viewBill.balanceDue : (viewBill.totalAmount - viewBill.paidAmount)))}
                  </strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => handlePrint(viewBill)}
              >
                <Icon name="icon-printer" size={16} />
                <span>Print Invoice</span>
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setViewBill(null)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Receive Payment Modal */}
      {payBill && (
        <Modal
          isOpen={!!payBill}
          onClose={() => setPayBill(null)}
          title={`Receive Payment — ${payBill.id}`}
          size="sm"
        >
          <form onSubmit={handleReceivePaymentSubmit}>
            <div style={{ padding: '1rem', background: 'var(--surface, #f8fafc)', borderRadius: '8px', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Patient</span>
                <strong>{payBill.patientName || 'Patient'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Balance Due</span>
                <strong style={{ color: 'var(--danger, #EF4444)', fontSize: '1.2rem' }}>
                  {Format.money(payBill.balanceDue != null ? payBill.balanceDue : (payBill.totalAmount - payBill.paidAmount))}
                </strong>
              </div>
            </div>

            <FormField label="Payment Amount (₹)" required>
              <input
                type="number"
                className="form-input"
                step="0.01"
                min="1"
                max={((payBill.balanceDue != null ? payBill.balanceDue : (payBill.totalAmount - payBill.paidAmount)) / 100).toFixed(2)}
                value={payAmountRupees}
                onChange={(e) => setPayAmountRupees(e.target.value)}
                required
              />
            </FormField>

            <FormField label="Payment Method" required>
              <select
                className="form-input"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="UPI">UPI (Google Pay, PhonePe, Paytm)</option>
                <option value="CARD">Credit / Debit Card</option>
                <option value="CASH">Cash</option>
              </select>
            </FormField>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setPayBill(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={paymentMutation.isPending}
              >
                {paymentMutation.isPending ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner spinner-sm" /> Processing...
                  </span>
                ) : (
                  <span>Receive ₹{payAmountRupees || '0.00'}</span>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default ReceptionBillingPage;
