"use client";

import { useEffect, useState } from "react";
import {
  IconBrandWindows,
  IconShieldCheck,
  IconLockAccess,
  IconArrowRight,
  IconAlertTriangle,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import { checkAuthSession, hasSessionIndicator, loginWithEntra } from "@/lib/auth";
import { getStoredUserEmail } from "@/lib/securityStore";

interface AuthErrorInfo {
  title: string;
  desc: string;
}

function getErrorMessage(code: string): AuthErrorInfo {
  switch (code) {
    case "wrong_tenant":
      return {
        title: "Wrong Organization Account",
        desc: "Please sign in using your official Gamuda corporate account (@gamuda.com.my). Personal or external Microsoft accounts are not authorized.",
      };
    case "account_disabled":
      return {
        title: "Account Deactivated",
        desc: "Your account has been deactivated. Please contact the GPO Administrator to restore your access.",
      };
    case "user_cancelled":
      return {
        title: "Sign-In Cancelled",
        desc: "The Microsoft authentication process was cancelled or declined. Click below whenever you are ready to sign in.",
      };
    case "session_expired":
      return {
        title: "Session Expired",
        desc: "Your sign-in attempt timed out or was interrupted. Please try again.",
      };
    case "missing_email":
      return {
        title: "Missing Email Address",
        desc: "No valid email address was received from your Microsoft profile. Please check with your IT administrator.",
      };
    case "database_unavailable":
      return {
        title: "Service Temporarily Unavailable",
        desc: "Could not connect to the system database. Please wait a few seconds and try again.",
      };
    default:
      return {
        title: "Authentication Failed",
        desc: "An unexpected error occurred during Microsoft sign-in. Please try again.",
      };
  }
}

export default function LoginPage() {
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for error query parameter from callback redirect (safely without causing SSR bail-out)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const err = params.get("error");
      if (err) {
        setAuthError(err);
      }
    }

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

  const handleSignIn = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setAuthError(null);
    loginWithEntra();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)] text-[var(--heading-color)]">
        <div className="animate-pulse text-sm font-semibold flex items-center gap-2">
          <IconLoader2 className="w-4 h-4 animate-spin text-[var(--accent-primary-text)]" />
          <span>Loading authentication...</span>
        </div>
      </div>
    );
  }

  const errorInfo = authError ? getErrorMessage(authError) : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[var(--bg-page)] via-[var(--bg-elevated)] to-[var(--bg-page)] text-[var(--heading-color)] relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#0078d4]/10 blur-3xl rounded-full pointer-events-none" />

      <div className="w-full max-w-md p-8 rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl relative z-10 flex flex-col items-center text-center backdrop-blur-md">
        {/* Header Badge */}
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--accent-primary-border)] bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] text-xs font-semibold">
          <IconShieldCheck className="w-4 h-4" />
          <span>Gamuda Single Sign-On</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[var(--heading-color)] mb-2">
          CQ Checker
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Gamuda Group Procurement Office — Supplier Audit & Certificate Verification Platform
        </p>

        {/* Dynamic Auth Error Notification Banner */}
        {errorInfo && (
          <div className="w-full mb-6 p-4 rounded-xl border border-[var(--mismatch-border)] bg-[var(--mismatch-bg)] text-left flex items-start gap-3 transition-all animate-in fade-in duration-200">
            <IconAlertTriangle className="w-5 h-5 text-[var(--mismatch-text)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-xs font-semibold text-[var(--mismatch-text)] uppercase tracking-wider">
                {errorInfo.title}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                {errorInfo.desc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
              title="Dismiss"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Microsoft SSO Action Card */}
        <div className="w-full space-y-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSignIn}
            className="w-full py-3.5 px-4 rounded-xl border border-[#0078d4] bg-[#0078d4] hover:bg-[#006abc] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <IconLoader2 className="w-5 h-5 animate-spin" />
                <span>Redirecting to Microsoft...</span>
              </>
            ) : (
              <>
                <IconBrandWindows className="w-5 h-5" />
                <span>Sign in with Microsoft Entra ID</span>
                <IconArrowRight className="w-4 h-4 ml-auto opacity-70" />
              </>
            )}
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
