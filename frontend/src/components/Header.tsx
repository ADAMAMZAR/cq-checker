"use client";

import Link from "next/link";
import { IconLoader2, IconHome, IconSettings } from "@tabler/icons-react";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  error: string | null;
  isLoading: boolean;
  isEvidenceLoading: boolean;
  onRefresh: () => void;
  onGoHome?: () => void;
}

export default function Header({ error, isLoading, isEvidenceLoading, onRefresh, onGoHome }: HeaderProps) {
  return (
    <header className="flex justify-between items-center mb-6 pb-6 border-b border-[var(--border-subtle)]">
      <button
        type="button"
        onClick={onGoHome}
        className={`flex items-center gap-3 text-left ${onGoHome ? 'cursor-pointer group' : ''}`}
        title={onGoHome ? "Return to Main Home" : undefined}
        aria-label={onGoHome ? "Return to Main Home" : undefined}
        disabled={!onGoHome}
      >
        <div className="p-2 rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] group-hover:scale-105 transition-transform">
          <IconHome className="h-5 w-5" />
        </div>
        <h1 className="font-sans text-lg font-bold tracking-tight text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)] transition-colors">
          Gamuda Group Procurement Office
        </h1>
      </button>
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-visible)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:border-[var(--accent-primary-border)] text-xs font-semibold transition-all"
          title="Open the admin tools (database, costs, schema, playground, ingest)"
        >
          <IconSettings className="w-3.5 h-3.5" />
          Admin
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
