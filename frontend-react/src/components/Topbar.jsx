import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from './Icon';
import { useAuth } from '../auth/AuthContext';
import { displayName, getInitials, formatDateTime } from '../utils/format';
import { appointmentsApi, notificationsApi, patientsApi } from '../api/resources';
import { ErrorState } from './States';

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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);

  const roleLabel = ROLE_LABELS[role] || role || 'Staff';
  const name = user?.staffName || user?.username || 'User';
  const initials = getInitials(name);
  const formattedName = displayName(name, role);
  const patientSearch = searchQuery.trim();
  const isLabDashboard = location.pathname === '/lab/dashboard';
  const labPatientSearch = searchParams.get('patientSearch') || '';

  const updateLabPatientSearch = (value) => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (value) {
        nextParams.set('patientSearch', value);
      } else {
        nextParams.delete('patientSearch');
      }
      return nextParams;
    }, { replace: true });
  };

  const { data: patientSearchData, isFetching: isSearchingPatients, error: patientSearchError, refetch: retryPatientSearch } = useQuery({
    queryKey: ['globalPatientSearch', role, patientSearch],
    queryFn: () => patientsApi.list({
      search: patientSearch,
      page_size: 5,
      ...(role === 'DOCTOR' ? { doctor_scope: 'mine' } : {}),
    }),
    enabled: ['RECEPTIONIST', 'DOCTOR'].includes(role) && patientSearch.length >= 2 && searchOpen,
  });
  const patientSearchResults = Array.isArray(patientSearchData)
    ? patientSearchData
    : (patientSearchData?.results || []);
  const {
    data: appointmentSearchData,
    isFetching: isSearchingAppointments,
    error: appointmentSearchError,
    refetch: retryAppointmentSearch,
  } = useQuery({
    queryKey: ['globalAppointmentSearch', patientSearch],
    queryFn: () => appointmentsApi.list({ search: patientSearch, page_size: 5 }),
    enabled: role === 'RECEPTIONIST' && patientSearch.length >= 2 && searchOpen,
  });
  const appointmentSearchResults = Array.isArray(appointmentSearchData)
    ? appointmentSearchData
    : (appointmentSearchData?.results || []);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const data = await notificationsApi.list();
      const list = Array.isArray(data) ? data : (data?.results || []);
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.is_read && !n.isRead).length);
      setNotificationError('');
    } catch (error) {
      console.error('Failed to load notifications', error);
      setNotificationError('Could not load notifications. Check your connection and try again.');
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000);
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
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
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

        {isLabDashboard ? (
          <form
            className="search-bar"
            id="lab-patient-search"
            ref={searchRef}
            style={{ maxWidth: '340px', position: 'relative' }}
            onSubmit={(event) => event.preventDefault()}
          >
            <span className="search-bar__icon">
              <Icon name="icon-search" size={16} />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              className="search-bar__input"
              value={labPatientSearch}
              onChange={(event) => updateLabPatientSearch(event.target.value)}
              placeholder="Search patient name or ID..."
              aria-label="Search lab orders by patient name or ID"
              id="lab-search-input"
            />
          </form>
        ) : role !== 'LAB_TECH' && (
          <form
            onSubmit={handleSearchSubmit}
            className="search-bar"
            id="global-search"
            ref={searchRef}
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
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchOpen(false);
              }}
              placeholder={role === 'ADMIN' ? 'Search users, staff...' : role === 'RECEPTIONIST' ? 'Search patients or appointments...' : 'Search patients...'}
              aria-label="Search"
              id="search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(true);
                  searchInputRef.current?.focus();
                }}
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
            {searchOpen && ['RECEPTIONIST', 'DOCTOR'].includes(role) && patientSearch.length >= 2 && (
              <div
                className="dropdown__menu is-open glass"
                role="listbox"
                aria-label={role === 'RECEPTIONIST' ? 'Patient and appointment search results' : 'Patient search results'}
                style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 1100, maxHeight: '360px', overflowY: 'auto' }}
              >
                {isSearchingPatients ? (
                  <div className="dropdown__item" role="status">Searching patients…</div>
                ) : patientSearchError ? (
                  <div style={{ padding: '0.75rem' }}>
                    <ErrorState title="Patient search failed" error={patientSearchError} onRetry={retryPatientSearch} />
                  </div>
                ) : patientSearchResults.length === 0 ? (
                  role === 'RECEPTIONIST' ? null : <div className="dropdown__item" role="status">No matching patients found</div>
                ) : patientSearchResults.map((patient) => (
                  <button
                    key={patient.id || patient.patient_id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="dropdown__item btn btn--ghost"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '0.65rem 0.85rem', textAlign: 'left' }}
                    onClick={() => {
                      const id = patient.id || patient.patient_id;
                      navigate({ pathname: '/shared/patient-profile', search: new URLSearchParams({ id: String(id) }).toString() });
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <strong>{patient.name}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>MRN: {patient.mrn || '—'} · {patient.phone || 'No phone'}</span>
                  </button>
                ))}
                {role === 'RECEPTIONIST' && isSearchingAppointments && (
                  <div className="dropdown__item" role="status">Searching appointments…</div>
                )}
                {role === 'RECEPTIONIST' && appointmentSearchError && (
                  <div style={{ padding: '0.75rem' }}>
                    <ErrorState title="Appointment search failed" error={appointmentSearchError} onRetry={retryAppointmentSearch} />
                  </div>
                )}
                {role === 'RECEPTIONIST' && appointmentSearchResults.length > 0 && (
                  <>
                    <div className="dropdown__item" style={{ fontWeight: 700, pointerEvents: 'none' }}>Appointments</div>
                    {appointmentSearchResults.map((appointment) => (
                      <button
                        key={appointment.id || appointment.appointment_id}
                        type="button"
                        role="option"
                        aria-selected="false"
                        className="dropdown__item btn btn--ghost"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '0.65rem 0.85rem', textAlign: 'left' }}
                        onClick={() => {
                          navigate(`/reception/appointments?search=${encodeURIComponent(patientSearch)}`);
                          setSearchOpen(false);
                          setSearchQuery('');
                        }}
                      >
                        <strong>{appointment.patientName || appointment.patient?.name || 'Appointment'}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {appointment.date} · {appointment.time} · {appointment.doctorName || appointment.doctor?.name || 'Doctor'} · {appointment.status}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {role === 'RECEPTIONIST' && !isSearchingPatients && !isSearchingAppointments && !patientSearchError && !appointmentSearchError && patientSearchResults.length === 0 && appointmentSearchResults.length === 0 && (
                  <div className="dropdown__item" role="status">No matching patients or appointments found</div>
                )}
              </div>
            )}
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
            onClick={() => {
              fetchNotifications();
              setNotifMenuOpen((isOpen) => !isOpen);
            }}
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
                {notificationError ? (
                  <div role="alert" style={{ padding: '1rem', color: 'var(--danger)' }}>
                    <p>{notificationError}</p>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={fetchNotifications}>Retry</button>
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8125rem' }}>
                    No notifications
                  </div>
                ) : (
                  notifications.map((n) => {
                    const isRead = n.is_read || n.isRead;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (!isRead) handleMarkOneRead(n.id);
                          if (n.link?.startsWith('/')) {
                            navigate(n.link);
                            setNotifMenuOpen(false);
                          }
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '0.75rem 1rem',
                          border: 0,
                          borderBottom: '1px solid var(--border)',
                          font: 'inherit',
                          textAlign: 'left',
                          cursor: n.link ? 'pointer' : isRead ? 'default' : 'pointer',
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
                      </button>
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
