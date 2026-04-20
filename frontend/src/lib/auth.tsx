import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiPost, apiGet } from './api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('madplan_token');
    if (!token) { setLoading(false); return; }
    try {
      const me = await apiGet<User>('/api/auth/me');
      setUser(me);
    } catch {
      localStorage.removeItem('madplan_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUser(); }, [loadUser]);

  const login = async (email: string, password: string) => {
    const { token, user: u } = await apiPost<{ token: string; user: User }>('/api/auth/login', { email, password });
    localStorage.setItem('madplan_token', token);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('madplan_token');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
