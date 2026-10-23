/**
 * Clinova Healthcare — Route Guard
 *
 * Call guard(allowedRoles) at the top of every page script.
 * - No session → redirect to login
 * - Session exists but role doesn't match → redirect to 403
 * - Session valid and role allowed → returns the session object
 *
 * Also initialises activity tracking for session timeout.
 */

import { session } from './session.js';

/**
 * Compute relative path prefix from the current page back to frontend/.
 * E.g., if we're at /frontend/pages/admin/dashboard.html → '../../'
 */
function getBasePath() {
  const path = window.location.pathname;
  // Find the index of '/frontend/' in the path
  const idx = path.indexOf('/frontend/');
  if (idx === -1) return './';
  const rest = path.slice(idx + '/frontend/'.length);
  const depth = rest.split('/').filter(Boolean).length - 1; // -1 for the filename
  return depth > 0 ? '../'.repeat(depth) : './';
}

/**
 * Guard the current page.
 * @param {string[]} allowedRoles - Array of roles permitted to access this page.
 * @returns {object} The current session.
 */
export function guard(allowedRoles) {
  const base = getBasePath();
  const sess = session.get();

  if (!sess) {
    window.location.replace(base + 'pages/login/index.html?expired=1');
    // Return a never-resolving promise to prevent further execution
    throw new Error('No session — redirecting to login');
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(sess.role)) {
    window.location.replace(base + 'pages/shared/403.html');
    throw new Error('Forbidden — redirecting to 403');
  }

  // Valid session — init activity tracking
  session.initActivityTracking();
  return sess;
}

/**
 * Role-based dashboard path lookup.
 */
export const ROLE_DASHBOARDS = {
  ADMIN:        'pages/admin/dashboard.html',
  DOCTOR:       'pages/doctor/dashboard.html',
  RECEPTIONIST: 'pages/reception/dashboard.html',
  PHARMACIST:   'pages/pharmacy/dashboard.html',
  LAB_TECH:     'pages/lab/dashboard.html',
};

/**
 * Get the dashboard path for the current session's role.
 */
export function getDashboardPath(role) {
  return ROLE_DASHBOARDS[role] || 'pages/login/index.html';
}
