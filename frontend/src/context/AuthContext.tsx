"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { checkAuthSession, UserSession } from "@/lib/auth";
import { setStoredUserEmail } from "@/lib/securityStore";

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  loading: boolean;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isAuthenticated: false,
  loading: true,
  refreshAuth: async () => { },
});

export const UNAUTHORIZED_EVENT = "gpo-unauthorized-session-event";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const verifyAuth = useCallback(async (isBackground = false) => {
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
        setStoredUserEmail("");
      }
    } catch (err) {
      console.error("Auth verification error:", err);
      setIsAuthenticated(false);
      setSession(null);
      setStoredUserEmail("");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    verifyAuth(false);

    // Quiet Stale-While-Revalidate: Re-check auth status when tab regains focus (0ms UI lag)
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === "visible") {
        verifyAuth(true);
      }
    };

    // Auto-invalidate session if API responds with 401 Unauthorized
    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setSession(null);
      setStoredUserEmail("");
    };

    window.addEventListener("visibilitychange", handleFocusOrVisibility);
    window.addEventListener("focus", handleFocusOrVisibility);
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);

    return () => {
      window.removeEventListener("visibilitychange", handleFocusOrVisibility);
      window.removeEventListener("focus", handleFocusOrVisibility);
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [verifyAuth]);

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated,
        loading,
        refreshAuth: () => verifyAuth(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
