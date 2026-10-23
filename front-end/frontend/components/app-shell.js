/**
 * Clinova Healthcare — App Shell
 *
 * Assembles the page layout: sidebar + overlay + header + main content area.
 * Provides initShell() which guards the page and renders the shell.
 */

import { guard } from '../core/guard.js';
import { renderSidebar } from './sidebar.js';
import { renderTopbar, COLLAPSIBLE_ROLES } from './topbar.js';

/**
 * Initialise the app shell.
 *
 * @param {string[]} allowedRoles - Roles permitted on this page.
 * @param {function} [onReady] - Called with (session) after the shell is rendered.
 * @returns {object} The current session.
 */
export function initShell(allowedRoles, onReady) {
  const session = guard(allowedRoles);
  document.body.classList.add('role-' + session.role.toLowerCase());
  
  if (COLLAPSIBLE_ROLES.includes(session.role)) {
    const storageKey = 'clinova.' + session.role.toLowerCase() + '.sidebarCollapsed';
    if (localStorage.getItem(storageKey) === 'true') {
      document.body.classList.add('is-sidebar-collapsed');
    }
  }

  // Build shell structure
  const appEl = document.getElementById('app');
  if (!appEl) {
    console.error('No #app element found');
    return session;
  }

  appEl.innerHTML = `
    <aside class="sidebar" id="sidebar"></aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <div class="main">
      <header class="header" id="topbar"></header>
      <div class="main__inner" id="page-content">
        <!-- Page content goes here -->
      </div>
    </div>
  `;

  // Render components
  renderSidebar(document.getElementById('sidebar'), session.role);
  renderTopbar(document.getElementById('topbar'), session);
  
  if (COLLAPSIBLE_ROLES.includes(session.role) && document.body.classList.contains('is-sidebar-collapsed')) {
      document.querySelectorAll('.sidebar .nav-item').forEach(item => {
          item.setAttribute('title', item.querySelector('span')?.textContent || '');
      });
  }

  // Call ready callback
  if (onReady) {
    onReady(session);
  }

  return session;
}

/**
 * Get the #page-content container for rendering page-specific content.
 */
export function getPageContent() {
  return document.getElementById('page-content');
}
