/**
 * Clinova Healthcare — Topbar Component
 *
 * Renders the header bar with:
 *  - Hamburger (< 1024px)
 *  - Search box (hidden for Lab Technicians)
 *  - Notification bell with dropdown
 *  - User menu with Log out
 */

import { db } from '../data/db.js';
import { auth } from '../api/auth.js';
import { Format, Toast } from './ui.js';

/** Roles that support the desktop sidebar collapse/expand toggle. */
export const COLLAPSIBLE_ROLES = ['DOCTOR', 'ADMIN'];

function icon(id, cls = '') {
  return `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="${getBasePath()}assets/icons/sprite.svg#${id}"></use></svg>`;
}

function getBasePath() {
  const path = window.location.pathname;
  const idx = path.indexOf('/frontend/');
  if (idx === -1) return './';
  const rest = path.slice(idx + '/frontend/'.length);
  const depth = rest.split('/').filter(Boolean).length - 1;
  return depth > 0 ? '../'.repeat(depth) : './';
}

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  DOCTOR: 'Doctor',
  RECEPTIONIST: 'Receptionist',
  PHARMACIST: 'Pharmacist',
  LAB_TECH: 'Lab Technician',
};

/**
 * Render the topbar into the given container element.
 */
export function renderTopbar(container, session) {
  const base = getBasePath();
  const initials = session.staffName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const roleLabel = ROLE_LABELS[session.role] || session.role;

  // Get unread notification count
  const updateUnreadCount = () => {
    let unreadCount = 0;
    try {
      const notifications = db.getAll('notifications');
      unreadCount = notifications.filter(n => {
        if (n.isRead) return false;
        if (n.targetUserId && n.targetUserId !== session.userId) return false;
        if (n.targetRole && n.targetRole !== session.role) return false;
        return true;
      }).length;
    } catch { /* ignore */ }
    
    const notifBtn = document.getElementById('notification-btn');
    if (notifBtn) {
      let countEl = notifBtn.querySelector('.notification-bell__count');
      if (unreadCount > 0) {
        if (!countEl) {
          countEl = document.createElement('span');
          countEl.className = 'notification-bell__count';
          notifBtn.appendChild(countEl);
        }
        countEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
      } else if (countEl) {
        countEl.remove();
      }
    }
    return unreadCount;
  };
  
  const initialUnread = updateUnreadCount();

  container.innerHTML = `
    <div class="topbar__left">
      <button class="hamburger" id="sidebar-toggle" aria-label="Toggle sidebar">
        ${icon('icon-menu')}
      </button>
      ${session.role === 'LAB_TECH' ? '' : `
        <div class="search-bar" id="global-search">
          <span class="search-bar__icon">${icon('icon-search', 'icon--sm')}</span>
          <input type="text" class="search-bar__input" placeholder="${session.role === 'ADMIN' ? 'Search staff, users, patients…' : 'Search patients, appointments…'}" aria-label="Search" id="search-input" autocomplete="off">
          <button id="search-clear" class="btn btn--ghost btn--icon" style="display:none; position: absolute; right: 40px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; min-height: 24px;" aria-label="Clear search">
            ${icon('icon-x', 'icon--sm')}
          </button>
          <kbd class="search-bar__kbd">⌘K</kbd>
          <div class="dropdown__menu" id="search-dropdown" style="width: 100%; top: calc(100% + 4px); max-height: 400px; overflow-y: auto;">
            <div id="search-results"></div>
          </div>
        </div>
      `}
    </div>
    <div class="topbar__right">
      <div class="notification-bell dropdown" id="notification-area">
        <button class="btn btn--ghost btn--icon" id="notification-btn" aria-label="Notifications" aria-expanded="false">
          ${icon('icon-bell')}
        </button>
        <div class="notification-dropdown dropdown__menu" id="notification-dropdown">
          <div class="notification-dropdown__header">
            <span class="text-card-title">Notifications</span>
            <button class="btn btn--ghost btn--sm" id="mark-all-read">Mark all read</button>
          </div>
          <div class="notification-dropdown__list" id="notification-list">
          </div>
          <div class="notification-dropdown__footer">
            <span class="text-caption">End of notifications</span>
          </div>
        </div>
      </div>

      <div class="dropdown" id="user-menu-area">
        <button class="topbar__user" id="user-menu-btn" aria-expanded="false">
          <div class="avatar avatar--sm" aria-hidden="true">${initials}</div>
          <div class="topbar__user-info">
            <span class="topbar__user-name">${Format.displayName(session.staffName, session.role)}</span>
            <span class="topbar__user-role">${roleLabel}</span>
          </div>
          ${icon('icon-chevron-down', 'icon--sm')}
        </button>
        <div class="dropdown__menu" id="user-dropdown">
          <div style="padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border);">
            <div style="font-weight: 500; font-size: 0.875rem; color: var(--text);">${Format.displayName(session.staffName, session.role)}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${roleLabel} · ${session.username}</div>
          </div>
          <button class="dropdown__item dropdown__item--danger" id="logout-btn">
            ${icon('icon-log-out')}
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Populate notification list
  populateNotifications(session);
  
  // Set initial count badge
  updateUnreadCount();

  // Event listeners
  setupTopbarEvents(session, updateUnreadCount);
}

function populateNotifications(session) {
  const listEl = document.getElementById('notification-list');
  if (!listEl) return;

  let notifications = [];
  try {
    notifications = db.getAll('notifications').filter(n => {
      if (n.targetUserId && n.targetUserId !== session.userId) return false;
      if (n.targetRole && n.targetRole !== session.role) return false;
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  } catch { /* ignore */ }

  if (notifications.length === 0) {
    listEl.innerHTML = `
      <div style="padding: var(--sp-8) var(--sp-4); text-align: center;">
        <span class="text-caption">No notifications</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = notifications.map(n => `
    <div class="notification-item ${n.isRead ? '' : 'is-unread'}" data-id="${n.id}">
      ${n.isRead ? '<div style="width:8px;flex-shrink:0;"></div>' : '<div class="notification-item__dot"></div>'}
      <div class="notification-item__content">
        <div class="notification-item__title">${n.title}</div>
        <div class="notification-item__text">${n.message}</div>
        <div class="notification-item__time">${formatRelativeTime(n.createdAt)}</div>
      </div>
    </div>
  `).join('');
}

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function setupTopbarEvents(session, updateUnreadCount) {
  const base = getBasePath();

  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  const closeMobileSidebar = () => {
    if (!sidebar?.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open');
    overlay?.classList.remove('is-visible');
    document.body.style.overflow = '';
    toggleBtn?.setAttribute('aria-expanded', 'false');
    toggleBtn?.focus();
  };

  const openMobileSidebar = () => {
    sidebar?.classList.add('is-open');
    overlay?.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
    toggleBtn?.setAttribute('aria-expanded', 'true');
  };

  toggleBtn?.addEventListener('click', () => {
    if (window.innerWidth >= 1024 && COLLAPSIBLE_ROLES.includes(session.role)) {
      document.body.classList.toggle('is-sidebar-collapsed');
      const isCollapsed = document.body.classList.contains('is-sidebar-collapsed');
      const storageKey = 'clinova.' + session.role.toLowerCase() + '.sidebarCollapsed';
      localStorage.setItem(storageKey, isCollapsed ? 'true' : 'false');
      toggleBtn.setAttribute('aria-expanded', !isCollapsed);
      
      // Toggle tooltips on nav items
      document.querySelectorAll('.sidebar .nav-item').forEach(item => {
        if (isCollapsed) {
          item.setAttribute('title', item.querySelector('span')?.textContent || '');
        } else {
          item.removeAttribute('title');
        }
      });
    } else {
      if (sidebar?.classList.contains('is-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    }
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.innerWidth < 1024) {
      closeMobileSidebar();
    }
  });

  // Close on nav link click
  document.querySelectorAll('.sidebar .nav-item').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 1024) closeMobileSidebar();
    });
  });

  // Clean up stale state on resize
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024 && sidebar?.classList.contains('is-open')) {
      sidebar.classList.remove('is-open');
      overlay?.classList.remove('is-visible');
      document.body.style.overflow = '';
    }
  });

  // Notification dropdown
  const notifBtn = document.getElementById('notification-btn');
  const notifDropdown = document.getElementById('notification-dropdown');
  notifBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown?.classList.toggle('is-open');
    // Close user menu
    document.getElementById('user-dropdown')?.classList.remove('is-open');
  });

  // Mark all read
  document.getElementById('mark-all-read')?.addEventListener('click', () => {
    try {
      const notifications = db.getAll('notifications');
      for (const n of notifications) {
        if (!n.isRead) {
          db.update('notifications', n.id, { isRead: true, _v: n._v });
        }
      }
      updateUnreadCount();
      populateNotifications(session);
    } catch { /* ignore */ }
  });

  // Handle individual notification clicks
  document.getElementById('notification-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.notification-item');
    if (!item) return;
    const id = item.dataset.id;
    try {
      const n = db.getById('notifications', id);
      if (!n.isRead) {
        db.update('notifications', id, { isRead: true, _v: n._v });
        updateUnreadCount();
      }
      if (n.link) {
        window.location.href = base + n.link;
      }
    } catch { /* ignore */ }
  });
  
  // Listen for background updates
  window.addEventListener('storage', (e) => {
    if (e.key === 'clinova.v1.notifications') {
      updateUnreadCount();
      populateNotifications(session);

      const previousIds = new Set(JSON.parse(e.oldValue || '[]').map(notification => notification.id));
      const newCriticalAlerts = JSON.parse(e.newValue || '[]').filter(notification =>
        notification.type === 'CRITICAL_RESULT' &&
        notification.targetUserId === session.userId &&
        !notification.isRead &&
        !previousIds.has(notification.id)
      );
      for (const alert of newCriticalAlerts) {
        Toast.show(alert.message, 'error');
      }
    }
  });

  window.addEventListener('clinova:notifications-updated', () => {
    updateUnreadCount();
    populateNotifications(session);
  });

  // User menu dropdown
  const userBtn = document.getElementById('user-menu-btn');
  const userDropdown = document.getElementById('user-dropdown');
  userBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown?.classList.toggle('is-open');
    // Close notification dropdown
    notifDropdown?.classList.remove('is-open');
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    auth.logout();
    window.location.href = base + 'pages/login/index.html';
  });

  // Close dropdowns on click outside
  document.addEventListener('click', () => {
    notifDropdown?.classList.remove('is-open');
    userDropdown?.classList.remove('is-open');
  });

  // Close sidebar overlay
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    if (window.innerWidth < 1024) closeMobileSidebar();
  });

  // Activate search for roles that have a search config
  const searchConfig = getSearchConfig(session);
  if (searchConfig) {
    setupSearch(session, searchConfig);
  }
}

/* ─── Role-specific search configs ─── */

function getDoctorSearchGroups(session, query, base, escapeHtml) {
  const allPatients = db.getAll('patients') || [];
  const labCatalog = db.getAll('labCatalog') || [];
  const getPat = (id) => allPatients.find(p => p.id === id) || { name: 'Unknown patient', mrn: '-' };
  const getTest = (id) => labCatalog.find(t => t.id === id) || { name: 'Unknown test' };

  const patients = allPatients.filter(p => 
    (p.name?.toLowerCase() ?? '').includes(query) || 
    (p.mrn?.toLowerCase() ?? '').includes(query) || 
    (p.phone?.toLowerCase() ?? '').includes(query)
  ).slice(0, 5);

  const appointments = (db.getAll('appointments') || []).filter(a => {
    if (a.doctorId !== session.staffId) return false;
    const pat = getPat(a.patientId);
    return (pat.name?.toLowerCase() ?? '').includes(query) || 
           (pat.mrn?.toLowerCase() ?? '').includes(query) || 
           (a.type?.toLowerCase() ?? '').includes(query) || 
           (a.status?.toLowerCase() ?? '').includes(query) || 
           (a.date ?? '').includes(query);
  }).slice(0, 5);

  const prescriptions = (db.getAll('prescriptions') || []).filter(p => {
    if (p.doctorId !== session.staffId) return false;
    const pat = getPat(p.patientId);
    const rxItems = Array.isArray(p.items) ? p.items : [];
    return (pat.name?.toLowerCase() ?? '').includes(query) || 
           (p.status?.toLowerCase() ?? '').includes(query) || 
           rxItems.some(m => (m.name?.toLowerCase() ?? '').includes(query));
  }).slice(0, 5);

  const labOrders = (db.getAll('labOrders') || []).filter(l => {
    if (l.doctorId !== session.staffId) return false;
    const pat = getPat(l.patientId);
    const test = getTest(l.testId);
    return (pat.name?.toLowerCase() ?? '').includes(query) || 
           (test.name?.toLowerCase() ?? '').includes(query) || 
           (l.status?.toLowerCase() ?? '').includes(query) || 
           (l.priority?.toLowerCase() ?? '').includes(query);
  }).slice(0, 5);

  const groups = [];

  if (patients.length) {
    groups.push({ label: 'Patients', items: patients.map(p => ({
      url: base + 'pages/shared/patient-profile.html?id=' + p.id,
      primary: escapeHtml(p.name),
      secondary: 'MRN: ' + escapeHtml(p.mrn),
    }))});
  }
  if (appointments.length) {
    groups.push({ label: 'Appointments', items: appointments.map(a => {
      const pat = getPat(a.patientId);
      return { url: base + 'pages/doctor/appointments.html',
        primary: escapeHtml(a.date) + ' · ' + escapeHtml(a.time),
        secondary: escapeHtml(pat.name) + ' · ' + escapeHtml(a.status) };
    })});
  }
  if (prescriptions.length) {
    groups.push({ label: 'Prescriptions', items: prescriptions.map(p => {
      const pat = getPat(p.patientId);
      const medItems = Array.isArray(p.items) ? p.items : [];
      const meds = medItems.map(m => m.name).join(', ');
      return { url: base + 'pages/doctor/prescriptions.html',
        primary: escapeHtml(pat.name),
        secondary: escapeHtml(meds) + ' · ' + escapeHtml(p.status) };
    })});
  }
  if (labOrders.length) {
    groups.push({ label: 'Lab Orders', items: labOrders.map(l => {
      const pat = getPat(l.patientId);
      const test = getTest(l.testId);
      return { url: base + 'pages/doctor/lab-orders.html',
        primary: escapeHtml(pat.name),
        secondary: escapeHtml(test.name) + ' · ' + escapeHtml(l.priority) + ' · ' + escapeHtml(l.status) };
    })});
  }

  return groups;
}

function getAdminSearchGroups(_session, query, base, escapeHtml) {
  const allDepts = db.getAll('departments') || [];
  const getDept = (id) => allDepts.find(d => d.id === id);

  const staff = (db.getAll('staff') || []).filter(s =>
    (s.name?.toLowerCase() ?? '').includes(query) ||
    (s.role?.toLowerCase() ?? '').includes(query) ||
    (s.designation?.toLowerCase() ?? '').includes(query)
  ).slice(0, 5);

  const users = (db.getAll('users') || []).filter(u =>
    (u.username?.toLowerCase() ?? '').includes(query) ||
    (u.role?.toLowerCase() ?? '').includes(query)
  ).slice(0, 5);

  const departments = allDepts.filter(d =>
    (d.name?.toLowerCase() ?? '').includes(query)
  ).slice(0, 5);

  const labTests = (db.getAll('labCatalog') || []).filter(t =>
    (t.name?.toLowerCase() ?? '').includes(query) ||
    (t.code?.toLowerCase() ?? '').includes(query)
  ).slice(0, 5);

  const patients = (db.getAll('patients') || []).filter(p =>
    (p.name?.toLowerCase() ?? '').includes(query) ||
    (p.mrn?.toLowerCase() ?? '').includes(query) ||
    (p.phone?.toLowerCase() ?? '').includes(query)
  ).slice(0, 5);

  const suppliers = (db.getAll('suppliers') || []).filter(s =>
    (s.name?.toLowerCase() ?? '').includes(query)
  ).slice(0, 5);

  const groups = [];

  if (staff.length) {
    groups.push({ label: 'Staff', items: staff.map(s => {
      const dept = s.departmentId ? getDept(s.departmentId) : null;
      return { url: base + 'pages/admin/staff.html',
        primary: escapeHtml(s.name),
        secondary: escapeHtml(s.role + ' · ' + s.designation) + (dept ? ' · ' + escapeHtml(dept.name) : '') };
    })});
  }
  if (users.length) {
    groups.push({ label: 'Users', items: users.map(u => ({
      url: base + 'pages/admin/users.html',
      primary: escapeHtml(u.username),
      secondary: escapeHtml(u.role),
    }))});
  }
  if (departments.length) {
    groups.push({ label: 'Departments', items: departments.map(d => ({
      url: base + 'pages/admin/departments.html',
      primary: escapeHtml(d.name),
      secondary: '',
    }))});
  }
  if (labTests.length) {
    groups.push({ label: 'Lab Tests', items: labTests.map(t => ({
      url: base + 'pages/admin/lab-catalog.html',
      primary: escapeHtml(t.name),
      secondary: escapeHtml(t.code),
    }))});
  }
  if (patients.length) {
    groups.push({ label: 'Patients', items: patients.map(p => ({
      url: base + 'pages/shared/patient-profile.html?id=' + p.id,
      primary: escapeHtml(p.name),
      secondary: 'MRN: ' + escapeHtml(p.mrn) + (p.phone ? ' · ' + escapeHtml(p.phone) : ''),
    }))});
  }
  if (suppliers.length) {
    groups.push({ label: 'Suppliers', items: suppliers.map(s => ({
      url: base + 'pages/admin/suppliers.html',
      primary: escapeHtml(s.name),
      secondary: '',
    }))});
  }

  return groups;
}

/**
 * Return the search config for the given session, or null if the role has no search.
 * Structured so Reception/Pharmacy configs can be added later.
 */
function getSearchConfig(session) {
  switch (session.role) {
    case 'DOCTOR':  return { getGroups: getDoctorSearchGroups };
    case 'ADMIN':   return { getGroups: getAdminSearchGroups };
    default:        return null;
  }
}

/* ─── Generic search setup (shared UX) ─── */

function setupSearch(session, config) {
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const searchDropdown = document.getElementById('search-dropdown');
  const searchResults = document.getElementById('search-results');
  if (!searchInput || !searchDropdown || !searchResults) return;

  const base = getBasePath();
  let selectedIndex = -1;
  let flatItems = [];

  const closeSearch = () => {
    searchDropdown.classList.remove('is-open');
    selectedIndex = -1;
  };

  const escapeHtml = (str) => {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, match => {
      const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return escapeMap[match];
    });
  };

  let searchTimeout;

  const performSearch = () => {
    const query = searchInput.value.toLowerCase().trim();
    if (query.length < 2) {
      closeSearch();
      searchClear.style.display = query.length > 0 ? 'block' : 'none';
      return;
    }
    searchClear.style.display = 'block';

    const groups = config.getGroups(session, query, base, escapeHtml);

    let html = '';
    flatItems = [];

    for (const group of groups) {
      html += `<div class="dropdown__divider" style="margin:0;"></div><div style="padding: 4px 16px; font-size: 0.75rem; font-weight: 600; color: var(--muted); text-transform: uppercase;">${group.label}</div>`;
      for (const item of group.items) {
        flatItems.push(item);
        html += `<a href="${item.url}" class="dropdown__item" style="display:flex; flex-direction:column; gap:2px; padding: 8px 16px;">
          <div style="font-weight:500;">${item.primary}</div>
          ${item.secondary ? `<div style="font-size:0.75rem; color:var(--muted);">${item.secondary}</div>` : ''}
        </a>`;
      }
    }

    if (flatItems.length === 0) {
      html = `<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 0.875rem;">No matching records found</div>`;
    }

    searchResults.innerHTML = html;
    searchDropdown.classList.add('is-open');
    selectedIndex = -1;
  };

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 150);
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      searchInput.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length > 0) {
        selectedIndex = (selectedIndex + 1) % flatItems.length;
        updateHighlight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length > 0) {
        selectedIndex = (selectedIndex - 1 + flatItems.length) % flatItems.length;
        updateHighlight();
      }
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < flatItems.length) {
        window.location.href = flatItems[selectedIndex].url;
      }
    }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    closeSearch();
    searchInput.focus();
  });

  const updateHighlight = () => {
    const nodes = searchResults.querySelectorAll('a.dropdown__item');
    nodes.forEach((node, i) => {
      if (i === selectedIndex) {
        node.style.background = 'var(--hover-bg)';
      } else {
        node.style.background = 'transparent';
      }
    });
  };

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
      closeSearch();
    }
  });
}
