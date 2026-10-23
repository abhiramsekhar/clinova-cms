/**
 * Clinova Healthcare — Pharmacy page chrome behaviour (Pharmacy pages only)
 *
 * Loaded only by frontend/pages/pharmacy/*.html. No shared file is modified.
 *
 *  < 1024px : the shared topbar hamburger already opens/closes the sidebar drawer
 *             (overlay click, ESC and nav-link click close it). This file does not touch that.
 *  >= 1024px: the shared hamburger only does something for Doctors, so here a click collapses /
 *             expands the sidebar to an icon rail (state remembered for the pharmacy module).
 */

const STORAGE_KEY = 'clinova.pharmacy.sidebarCollapsed';
const DESKTOP_MIN = 1024;

function syncNavTitles(collapsed) {
  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    if (collapsed) item.setAttribute('title', item.querySelector('span')?.textContent || '');
    else item.removeAttribute('title');
  });
}

function applyCollapsed(collapsed) {
  document.body.classList.toggle('ph-sidebar-collapsed', collapsed);
  document.getElementById('sidebar-toggle')?.setAttribute('aria-expanded', String(!collapsed));
  syncNavTitles(collapsed);
}

let remembered = false;
try { remembered = localStorage.getItem(STORAGE_KEY) === 'true'; } catch { /* storage unavailable */ }
applyCollapsed(remembered);

// Capture phase: on desktop, take over the hamburger click before the shared handler
// (which would only darken the page with the mobile overlay for non-Doctor roles).
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('#sidebar-toggle');
  if (!btn || window.innerWidth < DESKTOP_MIN) return;

  e.stopImmediatePropagation();
  document.getElementById('notification-dropdown')?.classList.remove('is-open');
  document.getElementById('user-dropdown')?.classList.remove('is-open');

  const collapsed = !document.body.classList.contains('ph-sidebar-collapsed');
  try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  applyCollapsed(collapsed);
}, true);
