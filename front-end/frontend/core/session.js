/**
 * Clinova Healthcare — Session Manager
 *
 * Manages the logged-in session in sessionStorage.
 * - 30-minute inactivity timeout
 * - Auto-extends on activity
 * - Provides current session data
 */

const SESSION_KEY = 'clinova.session';
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const session = {
  /**
   * Create a new session.
   */
  create(data) {
    const sess = {
      ...data,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    this._startWatchdog();
  },

  /**
   * Get the current session, or null if expired / not present.
   */
  get() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const sess = JSON.parse(raw);
      if (Date.now() - sess.lastActivity > TIMEOUT_MS) {
        this.destroy();
        return null;
      }
      return sess;
    } catch {
      this.destroy();
      return null;
    }
  },

  /**
   * Touch the session to extend its timeout.
   */
  touch() {
    const sess = this.get();
    if (!sess) return;
    sess.lastActivity = Date.now();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess));
  },

  /**
   * Destroy the session.
   */
  destroy() {
    sessionStorage.removeItem(SESSION_KEY);
    if (this._watchdogInterval) {
      clearInterval(this._watchdogInterval);
      this._watchdogInterval = null;
    }
  },

  /**
   * Check if a session exists and is valid.
   */
  isValid() {
    return this.get() !== null;
  },

  /**
   * Start a watchdog that checks timeout every 60 seconds.
   * If expired, redirects to login.
   */
  _watchdogInterval: null,
  _startWatchdog() {
    if (this._watchdogInterval) clearInterval(this._watchdogInterval);
    this._watchdogInterval = setInterval(() => {
      if (!this.isValid()) {
        this.destroy();
        // Redirect to login — compute relative path
        const depth = window.location.pathname.split('/').filter(Boolean).length;
        const prefix = '../'.repeat(Math.max(depth - 1, 0));
        window.location.href = prefix + 'pages/login/index.html?expired=1';
      }
    }, 60000);
  },

  /**
   * Initialize activity listeners (mouse, keyboard, touch).
   */
  initActivityTracking() {
    const throttledTouch = throttle(() => this.touch(), 30000);
    for (const evt of ['mousedown', 'keydown', 'touchstart', 'scroll']) {
      document.addEventListener(evt, throttledTouch, { passive: true });
    }
    // Also start the watchdog if session exists
    if (this.isValid()) {
      this._startWatchdog();
    }
  },
};

/* Simple throttle */
function throttle(fn, ms) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn.apply(this, args);
    }
  };
}
