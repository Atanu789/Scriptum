'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { User } from '@/types';
import { authApi } from '@/lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const token = localStorage.getItem('ultimoversio_token');
      const userRaw = localStorage.getItem('ultimoversio_user');
      if (token && userRaw) {
        const user = JSON.parse(userRaw) as User;
        setState({ user, token, isLoading: false, isAuthenticated: true });
      } else {
        setState((s) => ({ ...s, isLoading: false }));
      }
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const persist = useCallback((token: string, user: User) => {
    localStorage.setItem('ultimoversio_token', token);
    localStorage.setItem('ultimoversio_user', JSON.stringify(user));
    setState({ user, token, isLoading: false, isAuthenticated: true });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await authApi.login({ email, password });
    persist(token, user);
  }, [persist]);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const { token, user } = await authApi.google({ idToken });
    persist(token, user);
  }, [persist]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { token, user } = await authApi.register({ name, email, password });
    persist(token, user);
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem('ultimoversio_token');
    localStorage.removeItem('ultimoversio_user');
    setState({ user: null, token: null, isLoading: false, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithGoogle, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
