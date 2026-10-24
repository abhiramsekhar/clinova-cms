import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '../auth/AuthContext';
import SessionWarning from './SessionWarning';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { role } = useAuth();

  return (
    <div className={`app role-${role?.toLowerCase() || 'unknown'}`} id="app">
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
        <Topbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="main__inner" id="page-content">
          <Outlet />
        </main>
      </div>

      <SessionWarning />
    </div>
  );
}

export default AppShell;
