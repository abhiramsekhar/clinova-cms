import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../auth/AuthContext';
import { displayName, getInitials, formatDateTime } from '../utils/format';
import { notificationsApi } from '../api/resources';

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  DOCTOR: 'Doctor',
  RECEPTIONIST: 'Receptionist',
  PHARMACIST: 'Pharmacist',
  LAB_TECH: 'Lab Technician',
};

export function Topbar({ onToggleSidebar }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const searchInputRef = useRef(null);

  const roleLabel = ROLE_LABELS[role] || role || 'Staff';
  const name = user?.staffName || user?.username || 'User';
  const initials = getInitials(name);
  const formattedName = displayName(name, role);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const data = await notificationsApi.list();
      const list = Array.isArray(data) ? data : (data?.results || []);
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read && !n.isRead).length);
    } catch {
      // Ignore background notification fetch errors
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000); // 30s poll
      return () => clearInterval(interval);
    }
  }, [user]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global shortcut: Ctrl+K or Cmd+K focuses search
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark notifications read', err);
    }
  };

  const handleMarkOneRead = async (id) => {
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification read', err);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (role === 'RECEPTIONIST') {
      navigate(`/reception/patients?search=${encodeURIComponent(searchQuery.trim())}`);
    } else if (role === 'DOCTOR') {
      navigate(`/doctor/patients?search=${encodeURIComponent(searchQuery.trim())}`);
    } else if (role === 'PHARMACIST') {
      navigate(`/pharmacy/inventory?search=${encodeURIComponent(searchQuery.trim())}`);
    } else if (role === 'ADMIN') {
      navigate(`/admin/users?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

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

        {role !== 'LAB_TECH' && (
          <form
            onSubmit={handleSearchSubmit}
            className="search-bar"
            id="global-search"
            style={{ maxWidth: '340px', position: 'relative' }}
          >
            <span className="search-bar__icon">
              <Icon name="icon-search" size={16} />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              className="search-bar__input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={role === 'ADMIN' ? 'Search users, staff...' : 'Search patients...'}
              aria-label="Search"
              id="search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '48px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 0,
                  width: '20px',
                  height: '20px',
                }}
              >
                <Icon name="icon-x" size={12} />
              </button>
            )}
            <kbd className="search-bar__kbd" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
              ⌘K
            </kbd>
          </form>
        )}
      </div>

      <div className="topbar__right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Notifications */}
        <div className="dropdown" ref={notifRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            id="notification-btn"
            aria-label="Notifications"
            onClick={() => setNotifMenuOpen((p) => !p)}
            style={{ position: 'relative' }}
          >
            <Icon name="icon-bell" size={20} />
            {unreadCount > 0 && (
              <span
                className="notification-bell__count"
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: 'var(--danger, #EF4444)',
                  color: '#fff',
                  borderRadius: '999px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '2px 5px',
                  lineHeight: 1,
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifMenuOpen && (
            <div
              className="dropdown__menu is-open glass"
              id="notification-dropdown"
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '0.5rem',
                width: '320px',
                zIndex: 1000,
                background: 'var(--surface, #11282D)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.5))',
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>
                  Notifications ({unreadCount})
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={handleMarkAllRead}
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8125rem' }}>
                    No notifications
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isRead = n.is_read || n.isRead;
                    return (
                      <div
                        key={n.id}
                        onClick={() => !isRead && handleMarkOneRead(n.id)}
                        style={{
                          padding: '0.75rem 1rem',
                          borderBottom: '1px solid var(--border)',
                          cursor: isRead ? 'default' : 'pointer',
                          background: isRead ? 'transparent' : 'rgba(5, 102, 141, 0.1)',
                          transition: 'background 0.2s',
                        }}
                      >
                        <div style={{ fontSize: '0.8125rem', fontWeight: isRead ? 400 : 600, color: 'var(--text)' }}>
                          {n.message || n.title}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                          {formatDateTime(n.created_at || n.createdAt)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
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
                background: 'var(--surface, #11282D)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.5))',
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
                  color: 'var(--danger, #EF4444)',
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
