import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../services/api';
import type { UserProfile } from '../types/truthos';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  tavilyConfigured: boolean;
  theme: 'dark' | 'light';
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setTheme: (theme: 'dark' | 'light') => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tavilyConfigured, setTavilyConfigured] = useState(false);
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

  const applyTheme = useCallback((next: 'dark' | 'light') => {
    setThemeState(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: UserProfile; tavily_configured: boolean }>('/auth/me');
      setUser(data.user);
      setTavilyConfigured(Boolean(data.tavily_configured));
      applyTheme(data.user.theme_preference === 'light' ? 'light' : 'dark');
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    applyTheme('dark');
    void refreshUser();
  }, [applyTheme, refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ access_token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.access_token);
    setUser(res.user);
    applyTheme(res.user.theme_preference === 'light' ? 'light' : 'dark');
    const me = await apiFetch<{ user: UserProfile; tavily_configured: boolean }>('/auth/me').catch(() => null);
    if (me) setTavilyConfigured(me.tavily_configured);
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await apiFetch<{ access_token: string; user: UserProfile }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    setStoredToken(res.access_token);
    setUser(res.user);
    applyTheme(res.user.theme_preference === 'light' ? 'light' : 'dark');
    const me = await apiFetch<{ user: UserProfile; tavily_configured: boolean }>('/auth/me').catch(() => null);
    if (me) setTavilyConfigured(me.tavily_configured);
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        tavilyConfigured,
        theme,
        login,
        register,
        logout,
        refreshUser,
        setTheme: applyTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
