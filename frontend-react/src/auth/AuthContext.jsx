import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';

const AuthContext = createContext(null);

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
  const navigate = useNavigate();

  const logout = useCallback(async (redirectPath = '/login') => {
    const refreshToken = localStorage.getItem('clinova_refresh_token');
    if (refreshToken) {
      await authApi.logout(refreshToken);
    }
    localStorage.removeItem('clinova_access_token');
    localStorage.removeItem('clinova_refresh_token');
    localStorage.removeItem('clinova_user');
    setUser(null);
    navigate(redirectPath);
  }, [navigate]);

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
    return userData;
  };

  const value = {
    user,
    role: user?.role,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
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
