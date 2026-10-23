import React from 'react';
import Icon from './Icon';

export function LoadingState({ message = 'Loading data...' }) {
  return (
    <div className="empty-state" style={{ minHeight: '240px' }}>
      <div className="spinner" />
      <p style={{ marginTop: '1rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
        {message}
      </p>
    </div>
  );
}

export function EmptyState({
  title = 'No records found',
  description = 'There are no items matching your criteria.',
  icon = 'icon-clipboard-list',
  action = null,
}) {
  return (
    <div className="empty-state glass card" style={{ padding: '3rem 1.5rem', margin: '1rem 0' }}>
      <Icon name={icon} className="empty-state__icon" size={40} />
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: '0 0 0.5rem 0' }}>
        {title}
      </h3>
      <p style={{ margin: '0 0 1.25rem 0', maxWidth: '400px', fontSize: '0.875rem' }}>
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry = null,
}) {
  const errorMsg =
    typeof error === 'string'
      ? error
      : error?.response?.data?.detail || error?.message || 'Failed to load information.';

  return (
    <div className="empty-state glass card" style={{ padding: '3rem 1.5rem', borderColor: 'var(--danger-border)' }}>
      <div
        style={{
          width: '3rem',
          height: '3rem',
          borderRadius: '50%',
          background: 'var(--danger-light)',
          color: 'var(--danger)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
        }}
      >
        <Icon name="icon-alert-triangle" size={24} />
      </div>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--danger)', margin: '0 0 0.5rem 0' }}>
        {title}
      </h3>
      <p style={{ margin: '0 0 1.25rem 0', maxWidth: '450px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        {errorMsg}
      </p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          <Icon name="icon-history" size={16} />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
}
