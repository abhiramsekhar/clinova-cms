import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../auth/AuthContext';
import SessionWarning from './SessionWarning';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [labSidebarCollapsed, setLabSidebarCollapsed] = useState(false);
  const { role } = useAuth();

  return (
    <div
      className={`app role-${role?.toLowerCase() || 'unknown'}${labSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
      id="app"
    >
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div
        className={`sidebar-overlay ${sidebarOpen ? 'is-visible' : ''}`}
        id="sidebar-overlay"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className="main">
        <Topbar
          onToggleSidebar={() => {
            if (role === 'LAB_TECH' && window.matchMedia('(min-width: 1024px)').matches) {
              setLabSidebarCollapsed((prev) => !prev);
              return;
            }
            setSidebarOpen((prev) => !prev);
          }}
        />
        <main className="main__inner" id="page-content">
          <Outlet />
        </main>
      </div>

      <SessionWarning />
    </div>
  );
}

export default AppShell;
