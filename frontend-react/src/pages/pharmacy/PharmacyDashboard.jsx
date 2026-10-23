import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Icon from '../../components/Icon';
import { LoadingState, ErrorState } from '../../components/States';

export function PharmacyDashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch } = useQuery({
    queryKey: ['pharmacyDashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard/pharmacy/');
      return res.data;
    },
  });

  const { data: stockAlerts } = useQuery({
    queryKey: ['pharmacyStockAlerts'],
    queryFn: async () => {
      const res = await apiClient.get('/medicines/stock-alerts/');
      return res.data || [];
    },
  });

  if (statsLoading) {
    return <LoadingState message="Loading pharmacy dispensary dashboard..." />;
  }

  if (statsError) {
    return <ErrorState title="Failed to load pharmacy dashboard" error={statsError} onRetry={refetch} />;
  }

  const kpis = [
    { label: 'Pending Prescriptions', value: stats?.pendingPrescriptions ?? 0, icon: 'icon-clipboard-list', color: 'var(--warning)' },
    { label: 'Low Stock Items', value: stats?.lowStockMedicines ?? 0, icon: 'icon-alert-triangle', color: 'var(--warning)' },
    { label: 'Out of Stock Items', value: stats?.outOfStockMedicines ?? 0, icon: 'icon-package', color: 'var(--danger)' },
  ];

  const alertsList = Array.isArray(stockAlerts) ? stockAlerts : [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title">Pharmacy & Dispensary</h1>
          <p className="text-caption">Prescription dispensing, medication stock management, and batch tracking</p>
        </div>
        <div className="page-header__actions">
          <Link to="/pharmacy/prescription-queue" className="btn btn--primary">
            <Icon name="icon-clipboard-list" size={16} />
            <span>Dispensing Queue</span>
          </Link>
          <Link to="/pharmacy/inventory" className="btn btn--secondary">
            <Icon name="icon-package" size={16} />
            <span>Inventory</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Row */}
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

      {/* Low Stock Alerts */}
      <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Critical Stock Warnings
          </h3>
          <Link to="/pharmacy/stock-alerts" className="btn btn--ghost btn--sm">
            View All Alerts
          </Link>
        </div>

        {alertsList.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 0' }}>
            All pharmaceutical inventory levels are within normal parameters.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Current Stock</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {alertsList.slice(0, 8).map((med) => (
                  <tr key={med.id}>
                    <td style={{ fontWeight: 600 }}>{med.name}</td>
                    <td><code>{med.batchNo || '-'}</code></td>
                    <td><strong>{med.stockQuantity ?? med.quantity ?? 0} units</strong></td>
                    <td>{med.expiryDate || '-'}</td>
                    <td>
                      <span className={`badge badge--${(med.stockQuantity ?? 0) <= 0 ? 'danger' : 'warning'}`}>
                        {(med.stockQuantity ?? 0) <= 0 ? 'Out of Stock' : 'Low Stock'}
                      </span>
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

export default PharmacyDashboard;
