import React, { useSyncExternalStore, useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';
import { prescriptionsApi } from '../../api/resources';
import './pharmacy-module.css';

const COLLAPSED_CLASS = 'pharmacy-sidebar-collapsed';
const STORAGE_KEY = 'clinova.pharmacist.sidebarCollapsed';

function observeTopbar(callback) {
  if (typeof document === 'undefined' || !document.body) return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function getTopbarHost() {
  return typeof document === 'undefined' ? null : document.querySelector('#topbar .topbar__left');
}

function observeSidebarState(callback) {
  if (typeof document === 'undefined') return () => {};
  const app = document.getElementById('app');
  if (!app) return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(app, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function observeSidebarOpen(callback) {
  if (typeof document === 'undefined') return () => {};
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getSidebarCollapsed() {
  if (typeof document === 'undefined') return false;
  return document.getElementById('app')?.classList.contains(COLLAPSED_CLASS) || false;
}

function getSidebarOpen() {
  if (typeof document === 'undefined') return false;
  return document.getElementById('sidebar')?.classList.contains('is-open') || false;
}

export function PharmacySidebarToggle() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const showPrescriptionSearch = pathname === '/pharmacy/dashboard';
  const host = useSyncExternalStore(observeTopbar, getTopbarHost, () => null);
  const isCollapsed = useSyncExternalStore(observeSidebarState, getSidebarCollapsed, () => false);
  const isOpen = useSyncExternalStore(observeSidebarOpen, getSidebarOpen, () => false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchHostRef = useRef(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const prescriptionsQuery = useQuery({
    queryKey: ['pharmacyHeaderPrescriptionSearch'],
    queryFn: async () => {
      const pageSize = 200;
      const firstPage = await prescriptionsApi.list({ page_size: pageSize });
      if (Array.isArray(firstPage)) return firstPage;

      const prescriptions = [...(firstPage?.results || [])];
      const totalCount = Number(firstPage?.count) || prescriptions.length;
      let page = 2;
      while (prescriptions.length < totalCount) {
        const response = await prescriptionsApi.list({ page_size: pageSize, page });
        const rows = Array.isArray(response) ? response : response?.results || [];
        if (rows.length === 0) break;
        prescriptions.push(...rows);
        page += 1;
      }
      return prescriptions;
    },
    enabled: role === 'PHARMACIST' && showPrescriptionSearch && searchOpen && debouncedSearch.length > 0,
    staleTime: 60 * 1000,
  });

  const matchingPrescriptions = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    if (!term) return [];
    return (prescriptionsQuery.data || []).filter((prescription) =>
      String(prescription.patientName || '').toLowerCase().includes(term)
      || String(prescription.id || '').toLowerCase().includes(term)
    ).slice(0, 8);
  }, [debouncedSearch, prescriptionsQuery.data]);

  // Restore saved collapse preference on initial mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const app = document.getElementById('app');
    if (!app) return;
    let saved = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      // Storage unavailable
    }
    if (saved && window.innerWidth >= 1024) {
      app.classList.add(COLLAPSED_CLASS);
    }
  }, []);

  useEffect(() => {
    const closeDrawerOnEscape = (event) => {
      if (event.key !== 'Escape' || window.innerWidth >= 1024 || !isOpen) return;
      document.getElementById('sidebar')?.classList.remove('is-open');
      document.getElementById('sidebar-overlay')?.classList.remove('is-visible');
    };
    window.addEventListener('keydown', closeDrawerOnEscape);
    return () => window.removeEventListener('keydown', closeDrawerOnEscape);
  }, [isOpen]);

  useEffect(() => {
    if (!showPrescriptionSearch) return undefined;

    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleShortcut, true);
    return () => document.removeEventListener('keydown', handleShortcut, true);
  }, [showPrescriptionSearch]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (searchHostRef.current && !searchHostRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (role !== 'PHARMACIST' || !host) return null;

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      // Mobile overlay drawer toggle
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (sidebar) {
        const isOpen = sidebar.classList.contains('is-open');
        sidebar.classList.toggle('is-open', !isOpen);
        if (overlay) overlay.classList.toggle('is-visible', !isOpen);
      }
      return;
    }

    // Desktop collapse toggle
    const app = document.getElementById('app');
    if (!app) return;
    const nextCollapsed = !app.classList.contains(COLLAPSED_CLASS);
    app.classList.toggle(COLLAPSED_CLASS, nextCollapsed);
    try {
      localStorage.setItem(STORAGE_KEY, String(nextCollapsed));
    } catch {
      // Ignore storage errors
    }
  };

  return createPortal(
    <>
      <button
        type="button"
        className={`pharmacy-sidebar-toggle btn btn--ghost btn--icon ${isCollapsed ? 'is-collapsed' : ''}`}
        aria-label={window.innerWidth < 1024
          ? isOpen ? 'Close navigation menu' : 'Open navigation menu'
          : isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-controls="sidebar"
        aria-expanded={window.innerWidth < 1024 ? isOpen : !isCollapsed}
        title={window.innerWidth < 1024
          ? isOpen ? 'Close navigation menu' : 'Open navigation menu'
          : isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={toggleSidebar}
      >
        <Icon name="icon-menu" size={20} />
      </button>
      {showPrescriptionSearch && (
        <div className="pharmacy-header-search" ref={searchHostRef}>
          <form
            className="pharmacy-header-search__form"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Icon name="icon-search" size={16} />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearchOpen(false);
              }}
              placeholder="Search patient name or Rx ID..."
              aria-label="Search prescriptions by patient name or Rx ID"
              aria-expanded={searchOpen && Boolean(debouncedSearch)}
              aria-controls="pharmacy-prescription-search-results"
            />
            {search && (
              <button
                type="button"
                className="pharmacy-header-search__clear"
                onClick={() => {
                  setSearch('');
                  setSearchOpen(true);
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear prescription search"
              >
                <Icon name="icon-x" size={14} />
              </button>
            )}
          </form>
          {searchOpen && debouncedSearch && (
            <div
              className="pharmacy-header-search__results"
              id="pharmacy-prescription-search-results"
              role="listbox"
              aria-label="Prescription search results"
            >
              {prescriptionsQuery.isLoading ? (
                <div className="pharmacy-header-search__message" role="status">Searching prescriptions...</div>
              ) : prescriptionsQuery.error ? (
                <div className="pharmacy-header-search__message pharmacy-header-search__message--error" role="alert">
                  Unable to search prescriptions.
                  <button type="button" onClick={() => prescriptionsQuery.refetch()}>Retry</button>
                </div>
              ) : matchingPrescriptions.length === 0 ? (
                <div className="pharmacy-header-search__message" role="status">No results found</div>
              ) : matchingPrescriptions.map((prescription) => (
                <button
                  key={prescription.id}
                  type="button"
                  className="pharmacy-header-search__result"
                  role="option"
                  aria-selected="false"
                  onClick={() => {
                    setSearchOpen(false);
                    navigate(`/pharmacy/prescription-queue?search=${encodeURIComponent(prescription.id)}`);
                  }}
                >
                  <span className="pharmacy-header-search__patient">{prescription.patientName || 'Patient'}</span>
                  <span className="pharmacy-header-search__meta">
                    <span>Rx {prescription.id}</span>
                    <span>{String(prescription.status || 'PENDING').replaceAll('_', ' ')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>,
    host
  );
}

export default PharmacySidebarToggle;
