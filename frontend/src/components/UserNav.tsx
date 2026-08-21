"use client";

import { useEffect, useState } from "react";
import { IconBrandWindows, IconLogout, IconLoader2 } from "@tabler/icons-react";
import { checkAuthSession, loginWithEntra, logoutFromEntra, UserSession } from "@/lib/auth";

export default function UserNav() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await checkAuthSession();
        setIsAuthenticated(res.authenticated);
        setSession(res.user);
      } catch (err) {
        console.error("Error loading auth session:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs">
        <IconLoader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary-text)]" />
        <span>Checking auth...</span>
      </div>
    );
  }

  if (!isAuthenticated || !session) {
    return (
      <button
        type="button"
        onClick={loginWithEntra}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0078d4]/40 bg-[#0078d4]/10 hover:bg-[#0078d4]/20 text-[#0078d4] dark:text-[#50e6ff] text-xs font-semibold transition-all shadow-sm cursor-pointer"
        title="Sign in with corporate Microsoft Entra ID"
      >
        <IconBrandWindows className="w-4 h-4" />
        <span>Sign in with Microsoft</span>
      </button>
    );
  }

  const primaryRole = session.roles?.[0] || "user";

  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:flex flex-col text-right leading-tight">
        <span className="text-xs font-semibold text-[var(--heading-color)] truncate max-w-[140px]">
          {session.display_name || session.email}
        </span>
        <span className="text-[10px] text-[var(--accent-primary-text)] capitalize font-mono">
          {primaryRole}
        </span>
      </div>

      <button
        type="button"
        onClick={logoutFromEntra}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-visible)] bg-[var(--bg-elevated)] hover:border-red-500/50 hover:bg-red-500/10 text-[var(--text-secondary)] hover:text-red-500 text-xs font-semibold transition-all cursor-pointer"
        title={`Sign out (${session.email})`}
      >
        <IconLogout className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  );
}
