import React from 'react';
import { useAuth } from '../auth/AuthContext';
import Icon from './Icon';

export function SessionWarning() {
  const { sessionWarning, extendSession, logout } = useAuth();

  if (!sessionWarning) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal, 400)',
      }}
    >
      <div
        className="glass card"
        style={{
          maxWidth: '420px',
          width: '90%',
          padding: '2rem',
          borderRadius: '16px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'var(--warning-light)',
            color: 'var(--warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem auto',
          }}
        >
          <Icon name="icon-alert-triangle" size={24} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text)' }}>
          Session Expiring
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
          Your session will expire due to inactivity. Click below to continue working.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => logout()}
          >
            Log Out
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={extendSession}
          >
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  );
}

export default SessionWarning;
