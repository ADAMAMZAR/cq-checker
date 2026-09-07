"use client";

import { usePathname } from "next/navigation";
import {
  IconBuilding,
  IconAlertTriangle,
  IconLoader2,
  IconLogout,
} from "@tabler/icons-react";
import { loginWithEntra, logoutFromEntra } from "@/lib/auth";
import { isAuthorizedDomain } from "@/lib/securityStore";
import { useAuth } from "@/context/AuthContext";

export default function SecurityGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage =
    pathname === "/login" ||
    (typeof window !== "undefined" && window.location.pathname.startsWith("/login"));

  // 0. Public route bypass: Allow the dedicated /login page to render its own content & error banners
  if (isLoginPage) {
    return <>{children}</>;
  }

  const { session, isAuthenticated, loading } = useAuth();


  // 1. Loading state during initial cold auth session verification
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-page)] text-[var(--text-primary)]">
        <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <IconLoader2 className="w-8 h-8 animate-spin text-[var(--accent-primary-text)]" />
          <span className="text-xs font-semibold text-[var(--heading-color)]">
            Verifying corporate security credentials...
          </span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated state: Not signed in via SSO (Instant 0ms display across route transitions)
  if (!isAuthenticated || !session) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--text-primary)]">
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] p-8 shadow-xl text-center space-y-6">

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--heading-color)]">
                Authentication Required
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Only Gamudian are allow to access this platform. Please sign in using your Gamuda Corporate Email to access this platform.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={loginWithEntra}
                className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border border-[#0078d4]/40 bg-[#0078d4] hover:bg-[#006cc1] text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <span>Sign in with Microsoft</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 3. Unauthorized domain state: Signed in, but email domain is not @gamuda.com.my
  const isAllowedDomain = isAuthorizedDomain(session.email);
  if (!isAllowedDomain) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--text-primary)]">
        <header className="sticky top-0 z-40 w-full px-4 md:px-8 py-3 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-page)]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
              <IconBuilding className="h-4 w-4" />
            </div>
            <h1 className="font-sans text-sm font-bold tracking-tight text-[var(--heading-color)]">
              Gamuda Group Procurement Office
            </h1>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-[var(--bg-card-solid)] p-8 shadow-xl text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mx-auto">
              <IconAlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--heading-color)]">
                Access Denied
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Only Gamuda employees with valid <span className="font-mono font-bold text-red-500">@gamuda.com.my</span> accounts are authorized to access this portal.
              </p>
              <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-tertiary)] truncate">
                Signed in as: <span className="text-[var(--heading-color)] font-semibold">{session.email}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={logoutFromEntra}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold transition-all cursor-pointer"
            >
              <IconLogout className="w-4 h-4" />
              <span>Sign out & try another account</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // 4. Authenticated & Authorized Gamudian
  return <>{children}</>;
}