import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import { useAuth } from '../auth/AuthContext';
import { displayName, getInitials } from '../utils/format';

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  DOCTOR: 'Doctor',
  RECEPTIONIST: 'Receptionist',
  PHARMACIST: 'Pharmacist',
  LAB_TECH: 'Lab Technician',
};

export function Topbar({ onToggleSidebar }) {
  const { user, role, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const roleLabel = ROLE_LABELS[role] || role || 'Staff';
  const name = user?.staffName || user?.username || 'User';
  const initials = getInitials(name);
  const formattedName = displayName(name, role);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="header" id="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="hamburger btn btn--ghost btn--icon"
          id="sidebar-toggle"
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
        >
          <Icon name="icon-menu" size={20} />
        </button>

        <div className="search-bar" id="global-search" style={{ maxWidth: '320px' }}>
          <span className="search-bar__icon">
            <Icon name="icon-search" size={16} />
          </span>
          <input
            type="text"
            className="search-bar__input"
            placeholder={role === 'ADMIN' ? 'Search clinic...' : 'Quick search...'}
            aria-label="Search"
          />
        </div>
      </div>

      <div className="topbar__right">
        <div className="dropdown" ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="topbar__user btn btn--ghost"
            id="user-menu-btn"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((prev) => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          >
            <div className="avatar avatar--sm" aria-hidden="true">
              {initials}
            </div>
            <div className="topbar__user-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
              <span className="topbar__user-name" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                {formattedName}
              </span>
              <span className="topbar__user-role" style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                {roleLabel}
              </span>
            </div>
            <Icon name="icon-chevron-down" size={14} />
          </button>

          {userMenuOpen && (
            <div
              className="dropdown__menu is-open glass"
              id="user-dropdown"
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '0.5rem',
                minWidth: '220px',
                zIndex: 1000,
                background: 'var(--surface)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>
                  {formattedName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {roleLabel} • {user?.username}
                </div>
              </div>
              <button
                type="button"
                className="dropdown__item dropdown__item--danger btn btn--ghost"
                id="logout-btn"
                onClick={() => {
                  setUserMenuOpen(false);
                  logout();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  color: 'var(--danger)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon name="icon-log-out" size={16} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Topbar;
