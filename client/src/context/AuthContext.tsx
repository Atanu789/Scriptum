'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useAuth as useClerkAuth, useClerk, useSignIn, useSignUp, useUser } from '@clerk/nextjs';
import { User } from '@/types';
import { setAuthTokenProvider } from '@/lib/api';

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
  const { isLoaded: authLoaded, isSignedIn, userId, getToken } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { signOut } = useClerk();
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setAuthTokenProvider(async () => {
      try {
        return (await getToken()) ?? null;
      } catch {
        return null;
      }
    });

    return () => {
      setAuthTokenProvider(null);
    };
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;

    if (!authLoaded || !isSignedIn || !userId) {
      setToken(null);
      return;
    }

    (async () => {
      try {
        const nextToken = await getToken();
        if (!cancelled) {
          setToken(nextToken ?? null);
        }
      } catch {
        if (!cancelled) {
          setToken(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoaded, getToken, isSignedIn, userId]);

  const mapUser = useCallback((source: typeof clerkUser): User | null => {
    if (!source) return null;

    const email = source.primaryEmailAddress?.emailAddress || source.emailAddresses?.[0]?.emailAddress || '';
    const firstName = source.firstName?.trim() || '';
    const lastName = source.lastName?.trim() || '';
    const fallbackName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const displayName = source.fullName?.trim() || fallbackName || email || 'User';

    return {
      id: source.id,
      name: displayName,
      email,
      createdAt: source.createdAt ? new Date(source.createdAt).toISOString() : new Date().toISOString(),
    };
  }, []);

  const user = useMemo(() => mapUser(clerkUser), [clerkUser, mapUser]);

  const login = useCallback(async (email: string, password: string) => {
    if (!signInLoaded || !signIn || !setSignInActive) {
      throw new Error('Authentication is still loading. Please try again.');
    }

    const result = await signIn.create({
      identifier: email,
      password,
    });

    if (result.status !== 'complete' || !result.createdSessionId) {
      throw new Error('Sign in requires additional verification in Clerk.');
    }

    await setSignInActive({ session: result.createdSessionId });
  }, [setSignInActive, signIn, signInLoaded]);

  const loginWithGoogle = useCallback(async (_idToken: string) => {
    if (!signInLoaded || !signIn) {
      throw new Error('Authentication is still loading. Please try again.');
    }

    await signIn.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: '/sso-callback',
      redirectUrlComplete: '/dashboard',
    });
  }, [signIn, signInLoaded]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    if (!signUpLoaded || !signUp || !setSignUpActive) {
      throw new Error('Authentication is still loading. Please try again.');
    }

    const [firstName, ...rest] = name.trim().split(/\s+/).filter(Boolean);
    const lastName = rest.join(' ').trim();

    const result = await signUp.create({
      emailAddress: email,
      password,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    });

    if (result.status !== 'complete' || !result.createdSessionId) {
      throw new Error('Account created. Complete verification in Clerk to continue.');
    }

    await setSignUpActive({ session: result.createdSessionId });
  }, [setSignUpActive, signUp, signUpLoaded]);

  const logout = useCallback(async () => {
    await signOut();
    setToken(null);
  }, [signOut]);

  const state = useMemo<AuthState>(() => ({
    user,
    token,
    isLoading: !(authLoaded && userLoaded),
    isAuthenticated: Boolean(isSignedIn && user),
  }), [authLoaded, isSignedIn, token, user, userLoaded]);

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
