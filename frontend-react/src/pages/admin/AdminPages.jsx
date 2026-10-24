import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { departmentsApi, staffApi } from '../../api/resources';
import { normalizeError } from '../../api/errors';
import Badge from '../../components/Badge';
import { ConfirmDialog, DataTable, FormField, Modal, useToast } from '../../components/ui';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';

const STAFF_ROLES = [
  { id: 'DOCTOR', label: 'Doctor' },
  { id: 'RECEPTIONIST', label: 'Receptionist' },
  { id: 'PHARMACIST', label: 'Pharmacist' },
  { id: 'LAB_TECH', label: 'Lab Technician' },
  { id: 'ADMIN', label: 'Administrator' },
];

const EMPTY_STAFF_FORM = {
  id: '', name: '', designation: '', email: '', phone: '', roleId: '', departmentId: '',
  username: '', password: '', confirmPassword: '',
};

async function fetchAllPages(list, filters = {}) {
  const rows = [];
  let page = 1;
  while (true) {
    const response = await list({ ...filters, page, page_size: 200 });
    if (Array.isArray(response)) return page === 1 ? response : rows.concat(response);
    rows.push(...(Array.isArray(response?.results) ? response.results : []));
    if (!response?.next) return rows;
    page += 1;
  }
}

function apiErrorMessage(error) {
  return normalizeError(error).message || 'The request failed. Please try again.';
}

export function AdminStaffPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [formErrors, setFormErrors] = useState({ message: '', fieldErrors: {} });
  const [clientErrors, setClientErrors] = useState({});
  const [staffToDeactivate, setStaffToDeactivate] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const staffQuery = useQuery({
    queryKey: ['adminStaff', debouncedSearch, roleFilter, statusFilter, departmentFilter],
    queryFn: () => fetchAllPages(staffApi.list, {
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(statusFilter ? { is_active: statusFilter } : {}),
      ...(departmentFilter ? { department: departmentFilter } : {}),
    }),
  });
  const departmentsQuery = useQuery({
    queryKey: ['adminStaffDepartments'],
    queryFn: () => fetchAllPages(departmentsApi.list, { is_active: true }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }) => id ? staffApi.update(id, payload) : staffApi.create(payload),
    onSuccess: async (_data, variables) => {
      toast.success(variables.id ? 'Staff record updated.' : 'Staff member and login account created.');
      setFormOpen(false);
      setFormErrors({ message: '', fieldErrors: {} });
      setClientErrors({});
      setStaffForm(EMPTY_STAFF_FORM);
      await queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
      await queryClient.invalidateQueries({ queryKey: ['adminStaffDepartments'] });
    },
    onError: (error) => setFormErrors(normalizeError(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (staff) => staffApi.deactivate(staff.id),
    onSuccess: async () => {
      toast.success('Staff member and linked login account deactivated.');
      setStaffToDeactivate(null);
      await queryClient.invalidateQueries({ queryKey: ['adminStaff'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const openCreate = () => {
    setStaffForm(EMPTY_STAFF_FORM);
    setClientErrors({});
    setFormErrors({ message: '', fieldErrors: {} });
    setFormOpen(true);
  };

  const openEdit = (staff) => {
    setStaffForm({
      ...EMPTY_STAFF_FORM,
      id: staff.id,
      name: staff.name || '',
      designation: staff.designation || '',
      email: staff.email || '',
      phone: staff.phone || '',
      roleId: staff.role || '',
      departmentId: staff.departmentId || '',
    });
    setClientErrors({});
    setFormErrors({ message: '', fieldErrors: {} });
    setFormOpen(true);
  };

  const changeForm = (event) => {
    const { name, value } = event.target;
    setStaffForm((current) => ({ ...current, [name]: value }));
    setClientErrors((current) => ({ ...current, [name]: '' }));
    setFormErrors((current) => ({
      ...current,
      fieldErrors: { ...current.fieldErrors, [name]: undefined },
    }));
  };

  const submitForm = (event) => {
    event.preventDefault();
    const errors = {};
    if (!staffForm.name.trim()) errors.name = 'Enter the staff member’s name.';
    if (!staffForm.email.trim()) errors.email = 'Enter an email address.';
    if (!staffForm.roleId) errors.roleId = 'Select a staff role.';
    if (!staffForm.id) {
      if (!staffForm.username.trim()) errors.username = 'Enter the login username.';
      if (!staffForm.password) errors.password = 'Enter an initial password.';
      if (staffForm.password !== staffForm.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    }
    if (Object.keys(errors).length) {
      setClientErrors(errors);
      return;
    }

    const payload = {
      name: staffForm.name.trim(),
      designation: staffForm.designation.trim(),
      email: staffForm.email.trim(),
      phone: staffForm.phone.trim(),
      roleId: staffForm.roleId,
      departmentId: staffForm.departmentId || null,
    };
    if (!staffForm.id) {
      payload.username = staffForm.username.trim();
      payload.password = staffForm.password;
    }
    saveMutation.mutate({ id: staffForm.id || null, payload });
  };

  const rows = staffQuery.data || [];
  const columns = useMemo(() => [
    { key: 'name', label: 'Staff Member', sortable: true, render: (row) => <strong>{row.name}</strong> },
    { key: 'designation', label: 'Designation', sortable: true, render: (row) => row.designation || '—' },
    { key: 'role', label: 'Role', sortable: true, render: (row) => STAFF_ROLES.find((role) => role.id === row.role)?.label || row.role || '—' },
    { key: 'departmentName', label: 'Department', sortable: true, render: (row) => row.departmentName || '—' },
    { key: 'email', label: 'Email', sortable: true, render: (row) => row.email || '—' },
    { key: 'phone', label: 'Phone', render: (row) => row.phone || '—' },
    { key: 'isActive', label: 'Status', render: (row) => <Badge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
    { key: 'actions', label: 'Actions', render: (row) => (
      <div className="table-actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => openEdit(row)}>Edit</button>
        {row.isActive && <button type="button" className="btn btn--danger btn--sm" onClick={() => setStaffToDeactivate(row)}>Deactivate</button>}
      </div>
    ) },
  ], []);

  const fieldError = (name) => clientErrors[name] || formErrors.fieldErrors?.[name]?.join(' ');
  const hasFilters = Boolean(search.trim() || roleFilter || statusFilter || departmentFilter);

  return (
    <div>
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title">Staff Management</h1>
          <p className="text-caption">Manage staff profiles and linked login accounts</p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={openCreate}>Add Staff Member</button>
        </div>
      </div>

      <section className="glass card" style={{ padding: '1rem', marginBottom: '1rem' }} aria-label="Staff filters">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <FormField label="Search staff" htmlFor="admin-staff-search">
            <input id="admin-staff-search" className="form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or phone" />
          </FormField>
          <FormField label="Role" htmlFor="admin-staff-role-filter">
            <select id="admin-staff-role-filter" className="form-control" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">All roles</option>{STAFF_ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
            </select>
          </FormField>
          <FormField label="Department" htmlFor="admin-staff-department-filter">
            <select id="admin-staff-department-filter" className="form-control" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="">All departments</option>{(departmentsQuery.data || []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </FormField>
          <FormField label="Status" htmlFor="admin-staff-status-filter">
            <select id="admin-staff-status-filter" className="form-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option>
            </select>
          </FormField>
          <button type="button" className="btn btn--ghost" onClick={() => { setSearch(''); setRoleFilter(''); setDepartmentFilter(''); setStatusFilter(''); }}>Reset filters</button>
        </div>
      </section>

      {staffQuery.isLoading ? <LoadingState message="Loading staff records..." /> : staffQuery.error
        ? <ErrorState title="Unable to load staff records" error={staffQuery.error} onRetry={staffQuery.refetch} />
        : rows.length === 0 ? hasFilters
          ? <EmptyState title="No matching staff found" description="Try changing or clearing the selected filters." icon="icon-search" />
          : <EmptyState title="No staff records yet" description="Add a staff member to create a profile and linked login account." icon="icon-users" action={<button type="button" className="btn btn--primary" onClick={openCreate}>Add Staff Member</button>} />
        : <section className="glass card" style={{ padding: '1rem' }}>
          <DataTable columns={columns} data={rows} emptyTitle="No matching staff found" perPage={10} />
        </section>}

      <Modal
        isOpen={formOpen}
        onClose={() => !saveMutation.isPending && setFormOpen(false)}
        title={staffForm.id ? 'Edit Staff Member' : 'Add Staff Member'}
        size="lg"
        footer={<>
          <button type="button" className="btn btn--secondary" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>Cancel</button>
          <button type="submit" form="admin-staff-form" className="btn btn--primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : staffForm.id ? 'Save Changes' : 'Create Staff & Account'}
          </button>
        </>}
      >
        <form id="admin-staff-form" onSubmit={submitForm} noValidate>
          {formErrors.message && <p role="alert" style={{ color: 'var(--danger)', marginTop: 0 }}>{formErrors.message}</p>}
          <div className="form-grid">
            <FormField label="Full name" htmlFor="staff-name" error={fieldError('name')} required>
              <input id="staff-name" name="name" className="form-control" value={staffForm.name} onChange={changeForm} autoComplete="name" required maxLength={100} />
            </FormField>
            <FormField label="Email" htmlFor="staff-email" error={fieldError('email')} required>
              <input id="staff-email" name="email" type="email" className="form-control" value={staffForm.email} onChange={changeForm} autoComplete="email" required />
            </FormField>
            <FormField label="Role" htmlFor="staff-role" error={fieldError('roleId')} required>
              <select id="staff-role" name="roleId" className="form-control" value={staffForm.roleId} onChange={changeForm} required>
                <option value="">Select a role</option>{STAFF_ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
              </select>
            </FormField>
            <FormField label="Department" htmlFor="staff-department" error={fieldError('departmentId')} hint={departmentsQuery.error ? 'Departments could not be loaded; retry before selecting one.' : undefined}>
              <select id="staff-department" name="departmentId" className="form-control" value={staffForm.departmentId} onChange={changeForm} disabled={departmentsQuery.isLoading || Boolean(departmentsQuery.error)}>
                <option value="">No department</option>{(departmentsQuery.data || []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
              {departmentsQuery.error && <button type="button" className="btn btn--ghost btn--sm" onClick={() => departmentsQuery.refetch()}>Retry departments</button>}
            </FormField>
            <FormField label="Designation" htmlFor="staff-designation" error={fieldError('designation')}>
              <input id="staff-designation" name="designation" className="form-control" value={staffForm.designation} onChange={changeForm} maxLength={100} />
            </FormField>
            <FormField label="Phone" htmlFor="staff-phone" error={fieldError('phone')}>
              <input id="staff-phone" name="phone" type="tel" className="form-control" value={staffForm.phone} onChange={changeForm} autoComplete="tel" maxLength={20} />
            </FormField>
          </div>
          {!staffForm.id && <>
            <h3 className="text-card-title" style={{ marginTop: '0.5rem' }}>Login account</h3>
            <p className="text-caption">Set an initial password that meets the server password policy. It is write-only and will not be shown again.</p>
            <div className="form-grid">
              <FormField label="Username" htmlFor="staff-username" error={fieldError('username')} required>
                <input id="staff-username" name="username" className="form-control" value={staffForm.username} onChange={changeForm} autoComplete="username" required maxLength={50} />
              </FormField>
              <FormField label="Initial password" htmlFor="staff-password" error={fieldError('password')} hint="Validated against the configured Django password rules." required>
                <input id="staff-password" name="password" type="password" className="form-control" value={staffForm.password} onChange={changeForm} autoComplete="new-password" required />
              </FormField>
              <FormField label="Confirm password" htmlFor="staff-confirm-password" error={clientErrors.confirmPassword} required>
                <input id="staff-confirm-password" name="confirmPassword" type="password" className="form-control" value={staffForm.confirmPassword} onChange={changeForm} autoComplete="new-password" required />
              </FormField>
            </div>
          </>}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(staffToDeactivate)}
        onClose={() => !deactivateMutation.isPending && setStaffToDeactivate(null)}
        onConfirm={() => staffToDeactivate && deactivateMutation.mutate(staffToDeactivate)}
        title="Deactivate staff member?"
        message={staffToDeactivate ? `${staffToDeactivate.name} and the linked login account will be deactivated. Doctor deactivation is blocked while future scheduled or checked-in appointments remain.` : ''}
        confirmLabel="Deactivate"
        danger
        isLoading={deactivateMutation.isPending}
      />
    </div>
  );
}

export {
  AdminUsersPage,
  AdminDepartmentsPage,
  AdminLabCatalogPage,
  AdminSuppliersPage,
  AdminReportsPage,
  AdminSettingsPage,
  AdminAuditLogPage,
} from './AdminOperationalPages';
