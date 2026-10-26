import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardApi, medicinesApi } from '../../api/resources';
import Icon from '../../components/Icon';
import { LoadingState, ErrorState } from '../../components/States';
import PharmacyPageWrapper from './PharmacyPageWrapper';
import PharmacyDataTable, { PharmacyTableSkeleton } from './PharmacyDataTable';

export function PharmacyDashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch } = useQuery({
    queryKey: ['pharmacyDashboard'],
    queryFn: () => dashboardApi.pharmacy(),
  });

  const {
    data: stockAlerts = {},
    isLoading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts,
  } = useQuery({
    queryKey: ['pharmacyStockAlerts'],
    queryFn: () => medicinesApi.stockAlerts(),
  });

  if (statsLoading) {
    return (
      <PharmacyPageWrapper>
        <LoadingState message="Loading pharmacy dispensary dashboard..." />
      </PharmacyPageWrapper>
    );
  }
  if (statsError) {
    return (
      <PharmacyPageWrapper>
        <ErrorState title="Unable to load pharmacy dashboard" error={statsError} onRetry={refetch} />
      </PharmacyPageWrapper>
    );
  }

  const kpis = [
    { label: 'Pending Prescriptions', value: stats?.pendingPrescriptions ?? 0, icon: 'icon-clipboard-list', color: 'var(--warning, #eab308)' },
    { label: 'Low Stock Items', value: stats?.lowStockMedicines ?? 0, icon: 'icon-alert-triangle', color: 'var(--warning, #eab308)' },
    { label: 'Out of Stock Items', value: stats?.outOfStockMedicines ?? 0, icon: 'icon-package', color: 'var(--danger, #ef4444)' },
  ];

  const alertsList = [
    ...(stockAlerts.outOfStock || []).map((m) => ({ ...m, badgeClass: 'danger', badgeLabel: 'Out of Stock' })),
    ...(stockAlerts.lowStock || []).map((m) => ({ ...m, badgeClass: 'warning', badgeLabel: 'Low Stock' })),
    ...(stockAlerts.expired || []).map((m) => ({ ...m, badgeClass: 'danger', badgeLabel: 'Expired' })),
    ...(stockAlerts.expiring || []).map((m) => ({ ...m, badgeClass: 'warning', badgeLabel: 'Expiring Soon' })),
  ];

  return (
    <PharmacyPageWrapper>
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
      <div
        className="stat-row"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {kpis.map((kpi, idx) => (
          <div key={idx} className="glass card" style={{ padding: '1.25rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--muted, #64748b)' }}>{kpi.label}</span>
              <div style={{ color: kpi.color }}>
                <Icon name={kpi.icon} size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text, #1e293b)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Critical Stock Warnings Card */}
      <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text, #1e293b)', margin: 0 }}>
              Critical Stock Warnings
            </h3>
            <p className="text-caption" style={{ margin: 0, marginTop: '2px' }}>
              Medicines requiring immediate restocking or replenishment
            </p>
          </div>
          <Link to="/pharmacy/stock-alerts" className="btn btn--ghost btn--sm">
            <span>View All Alerts</span>
            <Icon name="icon-arrow-right" size={14} style={{ marginLeft: '4px' }} />
          </Link>
        </div>

        {alertsLoading ? (
          <PharmacyTableSkeleton columns={7} rows={4} />
        ) : alertsError ? (
          <ErrorState title="Unable to load stock alerts" error={alertsError} onRetry={refetchAlerts} />
        ) : alertsList.length === 0 ? (
          <p style={{ color: 'var(--muted, #64748b)', textAlign: 'center', padding: '2rem 0' }}>
            All pharmaceutical inventory levels are within normal parameters.
          </p>
        ) : (
          <PharmacyDataTable
            className="pharmacy-dashboard-table"
            minWidth="920px"
            columns={[
              { width: '22%' },
              { width: '13%' },
              { width: '14%', align: 'right' },
              { width: '15%', align: 'right' },
              { width: '13%' },
              { width: '12%', align: 'center' },
              { width: '11%', align: 'right' },
            ]}
          >
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {alertsList.slice(0, 8).map((med, index) => {
                  const qty = med.stockQuantity ?? med.quantity ?? 0;
                  const threshold = med.reorderThreshold ?? 10;
                  const isOut = qty <= 0;
                  const badgeClass = med.badgeClass || (isOut ? 'danger' : 'warning');
                  const badgeLabel = med.badgeLabel || (isOut ? 'Out of Stock' : 'Low Stock');

                  return (
                    <tr key={med.id || index}>
                      <td style={{ fontWeight: 600 }}>{med.name}</td>
                      <td><code>{med.batchNo || '—'}</code></td>
                      <td>
                        <strong style={{ color: isOut ? 'var(--danger, #ef4444)' : 'inherit' }}>
                          {qty} units
                        </strong>
                      </td>
                      <td style={{ color: 'var(--muted, #64748b)' }}>{threshold} units</td>
                      <td>{med.expiryDate || '—'}</td>
                      <td>
                        <span className={`badge badge--${badgeClass}`}>
                          {badgeLabel}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link
                          to={`/pharmacy/inventory?restock=${encodeURIComponent(med.id)}`}
                          className="btn btn--secondary btn--sm"
                        >
                          Restock
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
          </PharmacyDataTable>
        )}
      </div>
    </PharmacyPageWrapper>
  );
}

export default PharmacyDashboard;
