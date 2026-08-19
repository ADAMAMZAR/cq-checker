"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IconLoader2, IconHome, IconSettings } from "@tabler/icons-react";
import ThemeToggle from "./ThemeToggle";
import RoleDropdown from "./RoleDropdown";
import { getStoredRoleName, ROLE_CHANGED_EVENT } from "@/lib/roleStore";

interface HeaderProps {
  error: string | null;
  isLoading: boolean;
  isEvidenceLoading: boolean;
  onRefresh: () => void;
  onGoHome?: () => void;
  hideHomeIcon?: boolean;
}

export default function Header({ error, isLoading, isEvidenceLoading, onRefresh, onGoHome, hideHomeIcon }: HeaderProps) {
  const isClickable = Boolean(onGoHome);
  const showHomeIcon = Boolean(onGoHome) && !hideHomeIcon;

  const [activeRoleName, setActiveRoleName] = useState<string>("admin");

  useEffect(() => {
    setActiveRoleName(getStoredRoleName());

    const handleRoleChanged = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.roleName) {
        setActiveRoleName(customEv.detail.roleName);
      }
    };

    window.addEventListener(ROLE_CHANGED_EVENT, handleRoleChanged);
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, handleRoleChanged);
  }, []);

  const isAdmin = activeRoleName === "admin" || activeRoleName === "all";

  return (
    <header className="flex justify-between items-center mb-4 pb-2">
      {isClickable ? (
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-3 text-left cursor-pointer group"
          title="Return to Main Home"
          aria-label="Return to Main Home"
        >
          {showHomeIcon && (
            <div className="p-2 rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] group-hover:scale-105 transition-transform">
              <IconHome className="h-5 w-5" />
            </div>
          )}
          <h1 className="font-sans text-lg font-bold tracking-tight text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)] transition-colors">
            Gamuda Group Procurement Office
          </h1>
        </button>
      ) : (
        <div className="flex items-center gap-3">
          {showHomeIcon && (
            <div className="p-2 rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
              <IconHome className="h-5 w-5" />
            </div>
          )}
          <h1 className="font-sans text-lg font-bold tracking-tight text-[var(--heading-color)]">
            Gamuda Group Procurement Office
          </h1>
        </div>
      )}
      <div className="flex items-center gap-2 sm:gap-3">
        <RoleDropdown />
        {isAdmin && (
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-visible)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:border-[var(--accent-primary-border)] text-xs font-semibold transition-all animate-fade-in"
            title="Open the admin tools (database, costs, schema, playground, ingest)"
          >
            <IconSettings className="w-3.5 h-3.5" />
            Admin
          </Link>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
