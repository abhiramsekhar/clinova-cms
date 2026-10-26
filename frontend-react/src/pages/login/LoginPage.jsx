import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, getDashboardPath } from '../../auth/AuthContext';
import Icon from '../../components/Icon';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get('expired') === '1';

  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(getDashboardPath(role), { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim() || !password) {
      setErrorMsg('Please enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      navigate(getDashboardPath(user.role), { replace: true });
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        'Invalid credentials. Please verify username and password.';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-layout">
      {/* Left visual panel */}
      <div className="login-layout__visual">
        <div
          className="login-visual__inner"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            background: 'var(--navy-900)',
            color: '#fff',
            padding: '3rem',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            className="login-visual__hero"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
            }}
          >
            <img
              src="/assets/images/clinova-login-hero.jpg"
              alt="Medical background"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(135deg, rgba(5, 102, 141, 0.88) 0%, rgba(2, 195, 154, 0.72) 100%)',
              }}
            />
          </div>

          <div className="login-visual__content" style={{ position: 'relative', zIndex: 1, maxWidth: '480px' }}>
            <img
              src="/assets/images/logo-mark.svg"
              alt="Clinova logo"
              className="login-visual__logo"
              style={{
                width: '64px',
                height: '64px',
                marginBottom: '1.5rem',
                filter: 'brightness(0) invert(1) drop-shadow(0 4px 6px rgba(0,0,0,0.15))',
              }}
            />
            <h2 style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#fff', lineHeight: 1.2 }}>
              Clinova Healthcare
            </h2>
            <p style={{ fontSize: '1.25rem', color: '#D9ECEB', margin: '0 0 2rem 0' }}>
              Care. Precision. Trust.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                borderTop: '1px solid rgba(255,255,255,0.2)',
                paddingTop: '2rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem', color: 'rgba(255,255,255,0.92)' }}>
                <Icon name="icon-check-circle" size={20} style={{ color: '#02C39A' }} />
                Comprehensive Clinic & Patient Management
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem', color: 'rgba(255,255,255,0.92)' }}>
                <Icon name="icon-shield" size={20} style={{ color: '#02C39A' }} />
                Secure Role-Based Access Control
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1rem', color: 'rgba(255,255,255,0.92)' }}>
                <Icon name="icon-receipt" size={20} style={{ color: '#02C39A' }} />
                Integrated Pharmacy, Lab & Billing
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-layout__form" style={{ background: '#F6FAF9', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div
          className="login-form-wrapper glass card"
          style={{
            width: '100%',
            maxWidth: '440px',
            background: 'var(--surface, #ffffff)',
            padding: '2.5rem',
            borderRadius: '16px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
          }}
        >
          <div className="login-form__logo-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <img src="/assets/images/logo-mark.svg" alt="Clinova" style={{ width: '36px', height: '36px' }} />
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy-900)' }}>Clinova Healthcare</span>
          </div>

          <h1 className="text-page-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--text)' }}>
            Welcome back
          </h1>
          <p className="text-caption" style={{ color: 'var(--muted)', margin: '0 0 1.5rem 0' }}>
            Sign in to your account to continue
          </p>

          {isExpired && (
            <div className="form-banner form-banner--warning" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--warning-light, #fef3c7)', color: 'var(--warning, #b45309)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              <Icon name="icon-alert-triangle" size={16} />
              <span>Your session has expired. Please sign in again.</span>
            </div>
          )}

          {errorMsg && (
            <div className="form-banner form-banner--error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
              <Icon name="icon-alert-triangle" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-group__label" htmlFor="username" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text)' }}>
                Username
              </label>
              <input
                type="text"
                className="form-input"
                id="username"
                name="username"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-group__label" htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text)' }}>
                Password
              </label>
              <div className="form-password" style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  id="password"
                  name="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ width: '100%', padding: '0.75rem 2.5rem 0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem' }}
                />
                <button
                  type="button"
                  className="form-password__toggle btn btn--ghost btn--icon"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
                >
                  <Icon name={showPassword ? 'icon-eye-off' : 'icon-eye'} size={18} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--lg"
              id="login-btn"
              disabled={isSubmitting}
              style={{ width: '100%', padding: '0.875rem', borderRadius: '8px', fontWeight: 600, fontSize: '1rem', cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
            >
              {isSubmitting ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <span className="spinner spinner-sm" /> Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="login-footer" style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.8125rem', color: 'var(--muted)' }}>
            © 2026 Clinova Healthcare CMS
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
