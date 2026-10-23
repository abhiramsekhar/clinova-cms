import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth, getDashboardPath } from './auth/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import AppShell from './components/AppShell';

// Auth & Shared Pages
import LoginPage from './pages/login/LoginPage';
import ForbiddenPage from './pages/shared/ForbiddenPage';

// Dashboards
import AdminDashboard from './pages/admin/AdminDashboard';
import DoctorDashboard from './pages/doctor/DoctorDashboard';
import ReceptionDashboard from './pages/reception/ReceptionDashboard';
import PharmacyDashboard from './pages/pharmacy/PharmacyDashboard';
import LabDashboard from './pages/lab/LabDashboard';

// Admin Pages
import {
  AdminStaffPage,
  AdminUsersPage,
  AdminDepartmentsPage,
  AdminLabCatalogPage,
  AdminSuppliersPage,
  AdminReportsPage,
  AdminSettingsPage,
  AdminAuditLogPage,
} from './pages/admin/AdminPages';

// Doctor Pages
import {
  DoctorAppointmentsPage,
  DoctorPatientsPage,
  DoctorPrescriptionsPage,
  DoctorLabOrdersPage,
  DoctorClinicalHistoryPage,
  DoctorConsultationPage,
} from './pages/doctor/DoctorPages';

// Reception Pages
import {
  ReceptionPatientsPage,
  ReceptionAppointmentsPage,
  ReceptionBillingPage,
} from './pages/reception/ReceptionPages';

// Pharmacy Pages
import {
  PharmacyQueuePage,
  PharmacyInventoryPage,
  PharmacyPurchasesPage,
  PharmacySuppliersPage,
  PharmacyAlertsPage,
  PharmacyHistoryPage,
} from './pages/pharmacy/PharmacyPages';

// Lab Pages
import {
  LabQueuePage,
  LabCompletedPage,
  LabResultsPage,
  LabBillingPage,
  LabCatalogPage,
} from './pages/lab/LabPages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60 * 1000,
    },
  },
});

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <div className="spinner" />
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading Clinova CMS...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getDashboardPath(user.role)} replace />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/403" element={<ForbiddenPage />} />

              {/* Root redirect */}
              <Route path="/" element={<RootRedirect />} />

              {/* Admin Protected Routes */}
              <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                <Route element={<AppShell />}>
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/staff" element={<AdminStaffPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/departments" element={<AdminDepartmentsPage />} />
                  <Route path="/admin/lab-catalog" element={<AdminLabCatalogPage />} />
                  <Route path="/admin/suppliers" element={<AdminSuppliersPage />} />
                  <Route path="/admin/reports" element={<AdminReportsPage />} />
                  <Route path="/admin/settings" element={<AdminSettingsPage />} />
                  <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
                </Route>
              </Route>

              {/* Doctor Protected Routes */}
              <Route element={<ProtectedRoute allowedRoles={['DOCTOR']} />}>
                <Route element={<AppShell />}>
                  <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
                  <Route path="/doctor/appointments" element={<DoctorAppointmentsPage />} />
                  <Route path="/doctor/patients" element={<DoctorPatientsPage />} />
                  <Route path="/doctor/consultation" element={<DoctorConsultationPage />} />
                  <Route path="/doctor/prescriptions" element={<DoctorPrescriptionsPage />} />
                  <Route path="/doctor/lab-orders" element={<DoctorLabOrdersPage />} />
                  <Route path="/doctor/clinical-history" element={<DoctorClinicalHistoryPage />} />
                </Route>
              </Route>

              {/* Reception Protected Routes */}
              <Route element={<ProtectedRoute allowedRoles={['RECEPTIONIST', 'ADMIN']} />}>
                <Route element={<AppShell />}>
                  <Route path="/reception/dashboard" element={<ReceptionDashboard />} />
                  <Route path="/reception/patients" element={<ReceptionPatientsPage />} />
                  <Route path="/reception/appointments" element={<ReceptionAppointmentsPage />} />
                  <Route path="/reception/billing" element={<ReceptionBillingPage />} />
                </Route>
              </Route>

              {/* Pharmacy Protected Routes */}
              <Route element={<ProtectedRoute allowedRoles={['PHARMACIST', 'ADMIN']} />}>
                <Route element={<AppShell />}>
                  <Route path="/pharmacy/dashboard" element={<PharmacyDashboard />} />
                  <Route path="/pharmacy/prescription-queue" element={<PharmacyQueuePage />} />
                  <Route path="/pharmacy/inventory" element={<PharmacyInventoryPage />} />
                  <Route path="/pharmacy/purchases" element={<PharmacyPurchasesPage />} />
                  <Route path="/pharmacy/suppliers" element={<PharmacySuppliersPage />} />
                  <Route path="/pharmacy/stock-alerts" element={<PharmacyAlertsPage />} />
                  <Route path="/pharmacy/dispensing-history" element={<PharmacyHistoryPage />} />
                </Route>
              </Route>

              {/* Lab Protected Routes */}
              <Route element={<ProtectedRoute allowedRoles={['LAB_TECH', 'ADMIN']} />}>
                <Route element={<AppShell />}>
                  <Route path="/lab/dashboard" element={<LabDashboard />} />
                  <Route path="/lab/test-queue" element={<LabQueuePage />} />
                  <Route path="/lab/completed-tests" element={<LabCompletedPage />} />
                  <Route path="/lab/results" element={<LabResultsPage />} />
                  <Route path="/lab/billing" element={<LabBillingPage />} />
                  <Route path="/lab/catalog" element={<LabCatalogPage />} />
                </Route>
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
