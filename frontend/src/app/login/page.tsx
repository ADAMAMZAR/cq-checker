"use client";

import { useEffect, useState } from "react";
import { IconBrandWindows, IconShieldCheck, IconLockAccess, IconArrowRight } from "@tabler/icons-react";
import { checkAuthSession, hasSessionIndicator, loginWithEntra } from "@/lib/auth";
import { getStoredUserEmail } from "@/lib/securityStore";

export default function LoginPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const hasActiveSession = hasSessionIndicator() || (typeof window !== "undefined" && !!getStoredUserEmail());
      if (!hasActiveSession) {
        setLoading(false);
        return;
      }
      const session = await checkAuthSession();
      if (session.authenticated) {
        window.location.href = "/";
      } else {
        setLoading(false);
      }
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)] text-[var(--heading-color)]">
        <div className="animate-pulse text-sm font-semibold">Loading authentication...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[var(--bg-page)] via-[var(--bg-elevated)] to-[var(--bg-page)] text-[var(--heading-color)] relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0078d4]/10 blur-3xl rounded-full pointer-events-none" />

      <div className="w-full max-w-md p-8 rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl relative z-10 flex flex-col items-center text-center">
        {/* Header Badge */}
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--accent-primary-border)] bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] text-xs font-semibold">
          <IconShieldCheck className="w-4 h-4" />
          <span>Gamuda Single Sign-On</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[var(--heading-color)] mb-2">
          CQ Checker
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">
          Gamuda Group Procurement Office — Supplier Audit & Certificate Verification Platform
        </p>

        {/* Microsoft SSO Action Card */}
        <div className="w-full space-y-4">
          <button
            type="button"
            onClick={loginWithEntra}
            className="w-full py-3.5 px-4 rounded-xl border border-[#0078d4] bg-[#0078d4] hover:bg-[#006abc] text-white font-semibold text-sm flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          >
            <IconBrandWindows className="w-5 h-5" />
            <span>Sign in with Microsoft Entra ID</span>
            <IconArrowRight className="w-4 h-4 ml-auto opacity-70" />
          </button>

          <div className="pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex items-center justify-center gap-1.5">
            <IconLockAccess className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
            <span>Secured with Microsoft Entra OIDC Single Sign-On</span>
          </div>
        </div>
      </div>
    </div>
  );
}
