import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';

const AuthContext = createContext(null);

const TIMEOUT_MS = 30 * 60 * 1000;       // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000;  // warn 2 min before
const CHECK_INTERVAL_MS = 30 * 1000;      // check every 30s

export const ROLE_DASHBOARDS = {
  ADMIN: '/admin/dashboard',
  DOCTOR: '/doctor/dashboard',
  RECEPTIONIST: '/reception/dashboard',
  PHARMACIST: '/pharmacy/dashboard',
  LAB_TECH: '/lab/dashboard',
};

export function getDashboardPath(role) {
  return ROLE_DASHBOARDS[role] || '/login';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('clinova_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());
  const watchdogRef = useRef(null);

  const logout = useCallback(async (redirectPath = '/login') => {
    const refreshToken = localStorage.getItem('clinova_refresh_token');
    if (refreshToken) {
      await authApi.logout(refreshToken);
    }
    localStorage.removeItem('clinova_access_token');
    localStorage.removeItem('clinova_refresh_token');
    localStorage.removeItem('clinova_user');
    setUser(null);
    setSessionWarning(false);
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    navigate(redirectPath);
  }, [navigate]);

  // Activity tracking — touch on interaction
  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (sessionWarning) setSessionWarning(false);
  }, [sessionWarning]);

  // Start / stop watchdog when user changes
  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();

    // Throttled activity listener
    let throttleTimer = null;
    const onActivity = () => {
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => { throttleTimer = null; }, 15000);
        touchActivity();
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => document.addEventListener(e, onActivity, { passive: true }));

    // Watchdog interval
    watchdogRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= TIMEOUT_MS) {
        logout('/login?expired=1');
      } else if (idle >= TIMEOUT_MS - WARNING_BEFORE_MS) {
        setSessionWarning(true);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      events.forEach(e => document.removeEventListener(e, onActivity));
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [user, logout, touchActivity]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('clinova_access_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const me = await authApi.getMe();
        setUser(me);
        localStorage.setItem('clinova_user', JSON.stringify(me));
      } catch {
        // If getMe fails, logout
        logout('/login?expired=1');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    const handleAutoLogout = () => {
      logout('/login?expired=1');
    };
    window.addEventListener('clinova_logout', handleAutoLogout);
    return () => window.removeEventListener('clinova_logout', handleAutoLogout);
  }, [logout]);

  const login = async (username, password) => {
    const data = await authApi.login(username, password);
    const { access, refresh, user: userData } = data;

    localStorage.setItem('clinova_access_token', access);
    localStorage.setItem('clinova_refresh_token', refresh);
    localStorage.setItem('clinova_user', JSON.stringify(userData));

    setUser(userData);
    lastActivityRef.current = Date.now();
    return userData;
  };

  const extendSession = useCallback(() => {
    touchActivity();
  }, [touchActivity]);

  const value = {
    user,
    role: user?.role,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    sessionWarning,
    extendSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
