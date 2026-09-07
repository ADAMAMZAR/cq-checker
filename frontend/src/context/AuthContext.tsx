"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { checkAuthSession, hasSessionIndicator, clearSessionIndicator, UserSession } from "@/lib/auth";
import {
  getStoredUserEmail,
  getStoredUserSession,
  setStoredUserSession,
  clearStoredUserSession,
} from "@/lib/securityStore";

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  updateSessionRoles: (roles: string[]) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isAuthenticated: false,
  loading: true,
  refreshAuth: async () => { },
  updateSessionRoles: () => { },
});

export const UNAUTHORIZED_EVENT = "gpo-unauthorized-session-event";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Synchronous cache read for instant 0ms hydration on page loads / route switches
  const initialCache = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    const hasActive = hasSessionIndicator() || !!getStoredUserEmail();
    if (!hasActive) {
      clearStoredUserSession();
      return null;
    }
    return getStoredUserSession();
  }, []);

  const [session, setSession] = useState<UserSession | null>(initialCache?.user || null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(initialCache?.user));
  const [loading, setLoading] = useState<boolean>(!initialCache?.user);
  const initialCheckDone = useRef(false);

  const verifyAuth = useCallback(async (isBackground = false) => {
    const hasActiveSession = hasSessionIndicator() || (typeof window !== "undefined" && !!getStoredUserEmail());
    if (!hasActiveSession) {
      setIsAuthenticated(false);
      setSession(null);
      clearStoredUserSession();
      clearSessionIndicator();
      setLoading(false);
      return;
    }

    // 0ms Fast Path: If cache is fresh (< 15 mins), skip /auth/me network call completely!
    const cached = getStoredUserSession();
    if (cached && cached.isFresh && !isBackground) {
      setSession(cached.user);
      setIsAuthenticated(true);
      setLoading(false);
      return;
    }

    // Only show loading spinner if we have no session at all in memory
    if (!isBackground && !session) {
      setLoading(true);
    }

    try {
      const res = await checkAuthSession();
      setIsAuthenticated(res.authenticated);
      setSession(res.user);

      if (res.authenticated && res.user) {
        setStoredUserSession(res.user);
      } else {
        clearSessionIndicator();
        clearStoredUserSession();
      }
    } catch (err) {
      console.error("Auth verification error:", err);
      clearSessionIndicator();
      clearStoredUserSession();
      setIsAuthenticated(false);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!initialCheckDone.current) {
      initialCheckDone.current = true;
      verifyAuth(false);
    }

    // Auto-invalidate session if API responds with 401 Unauthorized
    const handleUnauthorized = () => {
      clearSessionIndicator();
      clearStoredUserSession();
      setIsAuthenticated(false);
      setSession(null);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);

    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [verifyAuth]);

  const updateSessionRoles = useCallback((roles: string[]) => {
    setSession((prev) => {
      if (!prev) return null;
      const updated = { ...prev, roles };
      setStoredUserSession(updated);
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated,
        loading,
        refreshAuth: () => verifyAuth(true),
        updateSessionRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

