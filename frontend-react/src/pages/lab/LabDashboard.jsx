import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { LoadingState, ErrorState } from '../../components/States';

export function LabDashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch } = useQuery({
    queryKey: ['labDashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard/lab/');
      return res.data;
    },
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['labOrdersActive'],
    queryFn: async () => {
      const res = await apiClient.get('/lab-orders/?status=ORDERED,SAMPLE_COLLECTED,PROCESSING');
      return res.data?.results || res.data || [];
    },
  });

  if (statsLoading || ordersLoading) {
    return <LoadingState message="Loading laboratory dashboard..." />;
  }

  if (statsError) {
    return <ErrorState title="Failed to load laboratory dashboard" error={statsError} onRetry={refetch} />;
  }

  const kpis = [
    { label: 'Pending Collection', value: stats?.pending ?? 0, icon: 'icon-clipboard-list', color: 'var(--warning)' },
    { label: 'Samples Collected', value: stats?.sampleCollected ?? 0, icon: 'icon-flask', color: 'var(--primary)' },
    { label: 'Currently Processing', value: stats?.processing ?? 0, icon: 'icon-history', color: 'var(--info)' },
    { label: 'Completed Today', value: stats?.completedToday ?? 0, icon: 'icon-check-circle', color: 'var(--success)' },
  ];

  const ordersList = Array.isArray(ordersData) ? ordersData : [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title">Laboratory Department</h1>
          <p className="text-caption">Diagnostic investigations, specimen analysis, and results verification</p>
        </div>
        <div className="page-header__actions">
          <Link to="/lab/test-queue" className="btn btn--primary">
            <Icon name="icon-clipboard-list" size={16} />
            <span>Process Queue</span>
          </Link>
          <Link to="/lab/catalog" className="btn btn--secondary">
            <Icon name="icon-flask" size={16} />
            <span>Test Catalog</span>
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

      {/* Active Investigations Queue */}
      <div className="glass card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Active Diagnostic Orders
          </h3>
          <Link to="/lab/test-queue" className="btn btn--ghost btn--sm">
            View All
          </Link>
        </div>

        {ordersList.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 0' }}>
            No active laboratory orders pending analysis.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Test Name</th>
                  <th>Patient</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {ordersList.slice(0, 8).map((order) => (
                  <tr key={order.id}>
                    <td><code>{order.id}</code></td>
                    <td style={{ fontWeight: 600 }}>{order.testName || order.test?.name || 'Diagnostic Test'}</td>
                    <td>{order.patientName || order.patient?.name || 'Patient'}</td>
                    <td>
                      <Badge variant={order.priority === 'STAT' ? 'danger' : order.priority === 'URGENT' ? 'warning' : 'neutral'}>
                        {order.priority || 'Normal'}
                      </Badge>
                    </td>
                    <td>
                      <Badge status={order.status} />
                    </td>
                    <td>
                      <Link to={`/lab/results?orderId=${order.id}`} className="btn btn--secondary btn--sm">
                        Enter Result
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

export default LabDashboard;
