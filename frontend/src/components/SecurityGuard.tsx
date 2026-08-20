"use client";

import { useState, useEffect } from "react";
import {
  IconBuilding,
} from "@tabler/icons-react";
import {
  getStoredUserEmail,
  isAuthorizedDomain,
  DEFAULT_AUTHORIZED_EMAIL,
  SECURITY_EMAIL_CHANGED_EVENT,
} from "@/lib/securityStore";
import SecurityGateToggle from "./SecurityGateToggle";
import ThemeToggle from "./ThemeToggle";

export default function SecurityGuard({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string>(DEFAULT_AUTHORIZED_EMAIL);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEmail(getStoredUserEmail());
    const handleEmailChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.email) {
        setEmail(customEv.detail.email);
      }
    };

    window.addEventListener(SECURITY_EMAIL_CHANGED_EVENT, handleEmailChanged);
    return () => window.removeEventListener(SECURITY_EMAIL_CHANGED_EVENT, handleEmailChanged);
  }, []);

  const isAllowed = isAuthorizedDomain(email);

  if (!mounted) {
    return <div style={{ visibility: "hidden" }}>{children}</div>;
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--text-primary)]">
        <header className="sticky top-0 z-40 w-full px-4 md:px-8 py-2.5 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-page)] transition-all">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
              <IconBuilding className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-sans text-sm font-bold tracking-tight text-[var(--heading-color)]">
                Gamuda Group Procurement Office
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <SecurityGateToggle />
            <ThemeToggle />
          </div>
        </header>

        {/* Full Screen Access Denied Security Wall */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-2xl border border-red-500/30 bg-[var(--bg-elevated)] p-8 shadow-2xl text-center relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--heading-color)] mb-2">
              Access Denied
            </h2>
            <p className="text-sm font-semibold text-red-500 dark:text-red-400 px-4 leading-relaxed">
              Only Gamudian are allowed to access this system.
            </p>
          </div>
        </main>
      </div>
    );
  }
  return <>{children}</>;
}