import React from 'react';
import ModulePage from '../shared/ModulePage';

export function AdminStaffPage() {
  return (
    <ModulePage
      title="Staff Management"
      subtitle="Manage medical staff profiles, doctors, nurses, and administrative roles"
      icon="icon-users"
      actionLabel="Add Staff Member"
    />
  );
}

export function AdminUsersPage() {
  return (
    <ModulePage
      title="User Accounts"
      subtitle="Manage login credentials, password resets, account locking, and role assignments"
      icon="icon-key"
      actionLabel="Create Account"
    />
  );
}

export function AdminDepartmentsPage() {
  return (
    <ModulePage
      title="Clinical Departments"
      subtitle="Department codes, consultation fees, and department heads"
      icon="icon-building"
      actionLabel="New Department"
    />
  );
}

export function AdminLabCatalogPage() {
  return (
    <ModulePage
      title="Lab Test Catalog"
      subtitle="Configure diagnostic investigations, parameters, reference ranges, and fees"
      icon="icon-flask"
      actionLabel="Add Test"
    />
  );
}

export function AdminSuppliersPage() {
  return (
    <ModulePage
      title="Pharmaceutical Suppliers"
      subtitle="Vendor contracts, medication supply rates, and vendor contacts"
      icon="icon-package"
      actionLabel="Add Supplier"
    />
  );
}

export function AdminReportsPage() {
  return (
    <ModulePage
      title="Analytics & Reports"
      subtitle="Financial statements, appointment statistics, patient demographics, and audit analytics"
      icon="icon-bar-chart"
      actionLabel="Generate Report"
    />
  );
}

export function AdminSettingsPage() {
  return (
    <ModulePage
      title="Clinic Settings"
      subtitle="Hospital branding, appointment slot duration, working hours, and billing configurations"
      icon="icon-settings"
      actionLabel="Save Changes"
    />
  );
}

export function AdminAuditLogPage() {
  return (
    <ModulePage
      title="System Audit Log"
      subtitle="Immutable trail of sensitive clinical and administrative operations"
      icon="icon-history"
    />
  );
}
