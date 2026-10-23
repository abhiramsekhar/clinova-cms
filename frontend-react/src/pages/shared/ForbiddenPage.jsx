import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useAuth, getDashboardPath } from '../../auth/AuthContext';

export function ForbiddenPage() {
  const navigate = useNavigate();
  const { role, isAuthenticated } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--surface-sunken, #f8fafc)',
      }}
    >
      <div
        className="glass card"
        style={{
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          padding: '3rem 2rem',
          borderRadius: '16px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--danger-light, #fee2e2)',
            color: 'var(--danger, #dc2626)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem auto',
          }}
        >
          <Icon name="icon-shield" size={32} />
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 0.75rem 0' }}>
          403 — Access Denied
        </h1>
        <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.95rem', margin: '0 0 2rem 0', lineHeight: 1.5 }}>
          You don't have permission to view this resource. Your account role does not have access to this module.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/login'))}
          >
            Go Back
          </button>
          {isAuthenticated ? (
            <Link to={getDashboardPath(role)} className="btn btn--primary">
              My Dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn btn--primary">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default ForbiddenPage;
