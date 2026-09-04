"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { checkAuthSession, hasSessionIndicator, clearSessionIndicator, UserSession } from "@/lib/auth";
import { getStoredUserEmail, setStoredUserEmail } from "@/lib/securityStore";

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
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const initialCheckDone = React.useRef(false);

  const verifyAuth = useCallback(async (isBackground = false) => {
    // Check if session indicator cookie exists (or fallback stored email for backward compatibility)
    const hasActiveSession = hasSessionIndicator() || (typeof window !== "undefined" && !!getStoredUserEmail());
    if (!hasActiveSession) {
      setIsAuthenticated(false);
      setSession(null);
      setStoredUserEmail("");
      setLoading(false);
      return;
    }

    // Only show loading spinner on initial cold mount, background checks run silently
    if (!isBackground && loading) {
      setLoading(true);
    }
    try {
      const res = await checkAuthSession();
      setIsAuthenticated(res.authenticated);
      setSession(res.user);

      if (res.authenticated && res.user) {
        if (res.user.email) setStoredUserEmail(res.user.email);
      } else {
        clearSessionIndicator();
        setStoredUserEmail("");
      }
    } catch (err) {
      console.error("Auth verification error:", err);
      clearSessionIndicator();
      setIsAuthenticated(false);
      setSession(null);
      setStoredUserEmail("");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    if (!initialCheckDone.current) {
      initialCheckDone.current = true;
      verifyAuth(false);
    }

    // Auto-invalidate session if API responds with 401 Unauthorized
    const handleUnauthorized = () => {
      clearSessionIndicator();
      setIsAuthenticated(false);
      setSession(null);
      setStoredUserEmail("");
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);

    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [verifyAuth]);

  const updateSessionRoles = useCallback((roles: string[]) => {
    setSession((prev) => (prev ? { ...prev, roles } : null));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated,
        loading,
        refreshAuth: () => verifyAuth(false),
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
