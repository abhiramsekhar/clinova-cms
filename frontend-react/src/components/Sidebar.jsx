import React from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../auth/AuthContext';

export const MENUS = {
  ADMIN: [
    {
      label: null,
      items: [
        { label: 'Dashboard', icon: 'icon-layout-dashboard', href: '/admin/dashboard', id: 'nav-dashboard' },
      ],
    },
    {
      label: 'Administration',
      items: [
        { label: 'Staff', icon: 'icon-users', href: '/admin/staff', id: 'nav-staff' },
        { label: 'Users', icon: 'icon-key', href: '/admin/users', id: 'nav-users' },
        { label: 'Departments', icon: 'icon-building', href: '/admin/departments', id: 'nav-departments' },
        { label: 'Lab Test Catalog', icon: 'icon-flask', href: '/admin/lab-catalog', id: 'nav-lab-catalog' },
        { label: 'Suppliers', icon: 'icon-package', href: '/admin/suppliers', id: 'nav-suppliers' },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'Reports', icon: 'icon-bar-chart', href: '/admin/reports', id: 'nav-reports' },
        { label: 'Settings', icon: 'icon-settings', href: '/admin/settings', id: 'nav-settings' },
        { label: 'Audit Log', icon: 'icon-history', href: '/admin/audit-log', id: 'nav-audit-log' },
      ],
    },
  ],

  DOCTOR: [
    {
      label: null,
      items: [
        { label: 'Dashboard', icon: 'icon-layout-dashboard', href: '/doctor/dashboard', id: 'nav-dashboard' },
      ],
    },
    {
      label: 'Clinical',
      items: [
        { label: 'My Appointments', icon: 'icon-calendar', href: '/doctor/appointments', id: 'nav-appointments' },
        { label: 'Patients', icon: 'icon-users', href: '/doctor/patients', id: 'nav-patients' },
        { label: 'Prescriptions', icon: 'icon-clipboard-list', href: '/doctor/prescriptions', id: 'nav-prescriptions' },
        { label: 'Lab Orders', icon: 'icon-flask', href: '/doctor/lab-orders', id: 'nav-lab-orders' },
      ],
    },
    {
      label: 'Reports',
      items: [
        { label: 'Clinical History', icon: 'icon-history', href: '/doctor/clinical-history', id: 'nav-clinical-history' },
      ],
    },
  ],

  RECEPTIONIST: [
    {
      label: null,
      items: [
        { label: 'Dashboard', icon: 'icon-layout-dashboard', href: '/reception/dashboard', id: 'nav-dashboard' },
      ],
    },
    {
      label: 'Front Desk',
      items: [
        { label: 'Patients', icon: 'icon-users', href: '/reception/patients', id: 'nav-patients' },
        { label: 'Appointments', icon: 'icon-calendar', href: '/reception/appointments', id: 'nav-appointments' },
      ],
    },
    {
      label: 'Billing',
      items: [
        { label: 'Billing', icon: 'icon-receipt', href: '/reception/billing', id: 'nav-billing' },
      ],
    },
  ],

  PHARMACIST: [
    {
      label: null,
      items: [
        { label: 'Dashboard', icon: 'icon-layout-dashboard', href: '/pharmacy/dashboard', id: 'nav-dashboard' },
      ],
    },
    {
      label: 'Pharmacy',
      items: [
        { label: 'Prescription Queue', icon: 'icon-clipboard-list', href: '/pharmacy/prescription-queue', id: 'nav-rx-queue' },
        { label: 'Inventory', icon: 'icon-package', href: '/pharmacy/inventory', id: 'nav-inventory' },
        { label: 'Purchases', icon: 'icon-receipt', href: '/pharmacy/purchases', id: 'nav-purchases' },
        { label: 'Suppliers', icon: 'icon-users', href: '/pharmacy/suppliers', id: 'nav-suppliers' },
        { label: 'Stock Alerts', icon: 'icon-alert-triangle', href: '/pharmacy/stock-alerts', id: 'nav-stock-alerts' },
      ],
    },
    {
      label: 'Transactions',
      items: [
        { label: 'Dispensing History', icon: 'icon-history', href: '/pharmacy/dispensing-history', id: 'nav-dispense-history' },
      ],
    },
  ],

  LAB_TECH: [
    {
      label: null,
      items: [
        { label: 'Dashboard', icon: 'icon-layout-dashboard', href: '/lab/dashboard', id: 'nav-dashboard' },
      ],
    },
    {
      label: 'Laboratory',
      items: [
        { label: 'Test Queue', icon: 'icon-clipboard-list', href: '/lab/test-queue', id: 'nav-test-queue' },
        { label: 'Completed Tests', icon: 'icon-check-circle', href: '/lab/completed-tests', id: 'nav-completed' },
      ],
    },
    {
      label: 'Billing',
      items: [
        { label: 'Billing & Receipts', icon: 'icon-receipt', href: '/lab/billing', id: 'nav-lab-billing' },
      ],
    },
    {
      label: 'Reference',
      items: [
        { label: 'Test Catalog', icon: 'icon-flask', href: '/lab/catalog', id: 'nav-test-catalog' },
      ],
    },
  ],
};

export function Sidebar({ isOpen, onClose }) {
  const { role } = useAuth();
  const menu = MENUS[role] || [];

  return (
    <aside className={`sidebar ${isOpen ? 'is-open' : ''}`} id="sidebar">
      <div className="sidebar__brand">
        <img
          src="/assets/images/logo-mark.svg"
          alt="Clinova"
          className="sidebar__logo"
        />
        <div className="sidebar__brand-text">
          <span className="sidebar__brand-name">Clinova</span>
          <span className="sidebar__brand-sub">Healthcare</span>
        </div>
      </div>

      <nav className="sidebar__nav" role="navigation" aria-label="Main navigation">
        {menu.map((group, gIdx) => (
          <div className="nav-group" key={gIdx}>
            {group.label && <div className="nav-group__label">{group.label}</div>}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                id={item.id}
                onClick={onClose}
                className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
                title={item.label}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <Icon name="icon-shield" size={16} />
        <span>Clinova CMS v1.0</span>
      </div>
    </aside>
  );
}

export default Sidebar;
