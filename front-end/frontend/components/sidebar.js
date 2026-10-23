/**
 * Clinova Healthcare — Sidebar Component
 *
 * Builds role-based navigation from the logged-in user's role.
 * Uses the icon sprite and nav-group/nav-item CSS classes from the design system.
 */

/**
 * Sidebar menu definitions per role.
 * Each group: { label, items: [{ label, icon, href, id }] }
 */
const MENUS = {
  ADMIN: [
    { label: null, items: [
      { label: 'Dashboard', icon: 'icon-layout-dashboard', href: 'pages/admin/dashboard.html', id: 'nav-dashboard' },
    ]},
    { label: 'Administration', items: [
      { label: 'Staff',             icon: 'icon-users',      href: 'pages/admin/staff.html',          id: 'nav-staff' },
      { label: 'Users',             icon: 'icon-key',        href: 'pages/admin/users.html',          id: 'nav-users' },
      { label: 'Departments',       icon: 'icon-building',   href: 'pages/admin/departments.html',    id: 'nav-departments' },
      { label: 'Lab Test Catalog',  icon: 'icon-flask',      href: 'pages/admin/lab-catalog.html',    id: 'nav-lab-catalog' },
      { label: 'Suppliers',         icon: 'icon-package',    href: 'pages/admin/suppliers.html',      id: 'nav-suppliers' },
    ]},
    { label: 'System', items: [
      { label: 'Reports',   icon: 'icon-bar-chart',  href: 'pages/admin/reports.html',    id: 'nav-reports' },
      { label: 'Settings',  icon: 'icon-settings',   href: 'pages/admin/settings.html',   id: 'nav-settings' },
      { label: 'Audit Log', icon: 'icon-history',    href: 'pages/admin/audit-log.html',  id: 'nav-audit-log' },
    ]},
  ],

  DOCTOR: [
    { label: null, items: [
      { label: 'Dashboard', icon: 'icon-layout-dashboard', href: 'pages/doctor/dashboard.html', id: 'nav-dashboard' },
    ]},
    { label: 'Clinical', items: [
      { label: 'My Appointments', icon: 'icon-calendar',       href: 'pages/doctor/appointments.html',  id: 'nav-appointments' },
      { label: 'Patients',        icon: 'icon-users',          href: 'pages/doctor/patients.html',       id: 'nav-patients' },
      { label: 'Prescriptions',   icon: 'icon-clipboard-list', href: 'pages/doctor/prescriptions.html', id: 'nav-prescriptions' },
      { label: 'Lab Orders',      icon: 'icon-flask',          href: 'pages/doctor/lab-orders.html',     id: 'nav-lab-orders' },
    ]},
    { label: 'Reports', items: [
      { label: 'Clinical History', icon: 'icon-history', href: 'pages/doctor/clinical-history.html', id: 'nav-clinical-history' },
    ]},
  ],

  RECEPTIONIST: [
    { label: null, items: [
      { label: 'Dashboard', icon: 'icon-layout-dashboard', href: 'pages/reception/dashboard.html', id: 'nav-dashboard' },
    ]},
    { label: 'Front Desk', items: [
      { label: 'Patients',     icon: 'icon-users',    href: 'pages/reception/patients.html',     id: 'nav-patients' },
      { label: 'Appointments', icon: 'icon-calendar', href: 'pages/reception/appointments.html', id: 'nav-appointments' },
    ]},
    { label: 'Billing', items: [
      { label: 'Billing', icon: 'icon-receipt', href: 'pages/reception/billing.html', id: 'nav-billing' },
    ]},
  ],

  PHARMACIST: [
    { label: null, items: [
      { label: 'Dashboard', icon: 'icon-layout-dashboard', href: 'pages/pharmacy/dashboard.html', id: 'nav-dashboard' },
    ]},
    { label: 'Pharmacy', items: [
      { label: 'Prescription Queue', icon: 'icon-clipboard-list', href: 'pages/pharmacy/prescription-queue.html', id: 'nav-rx-queue' },
      { label: 'Inventory',          icon: 'icon-package',        href: 'pages/pharmacy/inventory.html',          id: 'nav-inventory' },
      { label: 'Purchases',          icon: 'icon-receipt',        href: 'pages/pharmacy/purchases.html',          id: 'nav-purchases' },
      { label: 'Suppliers',          icon: 'icon-users',          href: 'pages/pharmacy/suppliers.html',          id: 'nav-suppliers' },
      { label: 'Stock Alerts',       icon: 'icon-alert-triangle', href: 'pages/pharmacy/stock-alerts.html',      id: 'nav-stock-alerts' },
    ]},
    { label: 'Transactions', items: [
      { label: 'Dispensing History', icon: 'icon-history', href: 'pages/pharmacy/dispensing-history.html', id: 'nav-dispense-history' },
    ]},
  ],

  LAB_TECH: [
    { label: null, items: [
      { label: 'Dashboard', icon: 'icon-layout-dashboard', href: 'pages/lab/dashboard.html', id: 'nav-dashboard' },
    ]},
    { label: 'Laboratory', items: [
      { label: 'Test Queue',      icon: 'icon-clipboard-list', href: 'pages/lab/test-queue.html',      id: 'nav-test-queue' },
      { label: 'Completed Tests', icon: 'icon-check-circle',   href: 'pages/lab/completed-tests.html', id: 'nav-completed' },
      { label: 'Results',         icon: 'icon-file-text',      href: 'pages/lab/results.html',          id: 'nav-results' },
    ]},
    { label: 'Billing', items: [
      { label: 'Billing & Receipts', icon: 'icon-receipt', href: 'pages/lab/billing.html', id: 'nav-lab-billing' },
    ]},
    { label: 'Reference', items: [
      { label: 'Test Catalog', icon: 'icon-flask', href: 'pages/lab/catalog.html', id: 'nav-test-catalog' },
    ]},
  ],
};

function icon(id) {
  return `<svg class="icon" aria-hidden="true"><use href="${getBasePath()}assets/icons/sprite.svg#${id}"></use></svg>`;
}

function getBasePath() {
  const path = window.location.pathname;
  const idx = path.indexOf('/frontend/');
  if (idx === -1) return './';
  const rest = path.slice(idx + '/frontend/'.length);
  const depth = rest.split('/').filter(Boolean).length - 1;
  return depth > 0 ? '../'.repeat(depth) : './';
}

/**
 * Render the sidebar into the given container element.
 */
export function renderSidebar(container, role) {
  const base = getBasePath();
  const menu = MENUS[role] || [];
  const currentPath = window.location.pathname;

  let html = `
    <div class="sidebar__brand">
      <img src="${base}assets/images/logo-mark.svg" alt="Clinova" class="sidebar__logo">
      <div class="sidebar__brand-text">
        <span class="sidebar__brand-name">Clinova</span>
        <span class="sidebar__brand-sub">Healthcare</span>
      </div>
    </div>
    <nav class="sidebar__nav" role="navigation" aria-label="Main navigation">
  `;

  for (const group of menu) {
    html += `<div class="nav-group">`;
    if (group.label) {
      html += `<div class="nav-group__label">${group.label}</div>`;
    }
    for (const item of group.items) {
      const fullHref = base + item.href;
      const isActive = currentPath.endsWith(item.href.split('/').pop());
      html += `
        <a href="${fullHref}" class="nav-item${isActive ? ' is-active' : ''}" id="${item.id}">
          ${icon(item.icon)}
          <span>${item.label}</span>
        </a>
      `;
    }
    html += `</div>`;
  }

  html += `
    </nav>
    <div class="sidebar__footer">
      ${icon('icon-shield')}
      <span>v1.0</span>
    </div>
  `;

  container.innerHTML = html;
}
