import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { dashboardApi, labOrdersApi } from '../../api/resources';
import Icon from '../../components/Icon';
import Badge from '../../components/Badge';
import { LoadingState, ErrorState, EmptyState } from '../../components/States';

export function LabDashboard() {
  const [searchParams] = useSearchParams();
  const patientSearch = searchParams.get('patientSearch') || '';

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['labDashboard'],
    queryFn: dashboardApi.lab,
  });

  const {
    data: ordersData,
    isLoading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['labOrdersActive'],
    queryFn: () => labOrdersApi.list({
      status: 'ORDERED,SAMPLE_COLLECTED,PROCESSING,IN_PROGRESS',
      page_size: 200,
    }),
    refetchInterval: 15000,
  });

  if (statsLoading || ordersLoading) {
    return <LoadingState message="Loading laboratory dashboard..." />;
  }

  if (statsError) {
    return <ErrorState title="Failed to load laboratory dashboard" error={statsError} onRetry={refetchStats} />;
  }

  const kpis = [
    { label: 'Pending Collection', value: stats?.pending ?? 0, icon: 'icon-clipboard-list', color: 'var(--warning)' },
    { label: 'Samples Collected', value: stats?.sampleCollected ?? 0, icon: 'icon-flask', color: 'var(--primary)' },
    { label: 'Currently Processing', value: stats?.processing ?? 0, icon: 'icon-history', color: 'var(--info)' },
    { label: 'Completed Today', value: stats?.completedToday ?? 0, icon: 'icon-check-circle', color: 'var(--success)' },
  ];

  const ordersList = Array.isArray(ordersData?.results)
    ? ordersData.results
    : Array.isArray(ordersData)
      ? ordersData
      : [];
  const normalizedSearch = patientSearch.trim().toLowerCase();
  const filteredOrders = normalizedSearch
    ? ordersList.filter((order) => (
      (order.patientName || order.patient?.name || '').toLowerCase().includes(normalizedSearch)
      || (order.patientId || order.patient?.id || '').toLowerCase().includes(normalizedSearch)
    ))
    : ordersList.slice(0, 8);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            Active Diagnostic Orders
          </h3>
          <Link to="/lab/test-queue" className="btn btn--ghost btn--sm">
            View All
          </Link>
        </div>

        {ordersError ? (
          <ErrorState
            title="Failed to load active laboratory orders"
            error={ordersError}
            onRetry={refetchOrders}
          />
        ) : ordersList.length === 0 ? (
          <EmptyState
            title="No active laboratory orders"
            description="There are no orders awaiting collection or processing."
            icon="icon-flask"
          />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            title="No matching patients"
            description="Try another patient name or ID."
            icon="icon-search"
          />
        ) : (
          <div className="table-wrapper lab-orders-table-wrapper">
            <table className="table lab-orders-table">
              <colgroup>
                <col className="lab-orders-table__order" />
                <col className="lab-orders-table__test" />
                <col className="lab-orders-table__patient" />
                <col className="lab-orders-table__priority" />
                <col className="lab-orders-table__status" />
                <col className="lab-orders-table__action" />
              </colgroup>
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
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="lab-orders-table__id"><code>{order.id}</code></td>
                    <td className="lab-orders-table__test-name">{order.testName || order.test?.name || 'Diagnostic Test'}</td>
                    <td className="lab-orders-table__patient-name">
                      <span>{order.patientName || order.patient?.name || 'Patient'}</span>
                      {(order.patientId || order.patient?.id) && (
                        <code className="lab-orders-table__patient-id">
                          {order.patientId || order.patient.id}
                        </code>
                      )}
                    </td>
                    <td>
                      <Badge variant={order.priority === 'STAT' ? 'danger' : order.priority === 'URGENT' ? 'warning' : 'neutral'}>
                        {order.priority || 'Normal'}
                      </Badge>
                    </td>
                    <td>
                      <Badge status={order.status} />
                    </td>
                    <td>
                      <Link
                        to={`/lab/test-queue?search=${encodeURIComponent(order.patientName || order.patient?.name || '')}&patientId=${encodeURIComponent(order.patientId || order.patient?.id || '')}&selectedOrder=${encodeURIComponent(order.id)}`}
                        className="btn btn--primary btn--sm"
                      >
                        Go
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
