"use client";

import { IconLoader2, IconHome } from "@tabler/icons-react";
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
        <ThemeToggle />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[11px] font-medium text-[var(--text-secondary)]">
          <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-[var(--accent-danger)] animate-pulse' : 'bg-[var(--accent-success)]'}`} />
          {error ? "Database Offline" : "Database Live"}
        </div>
        <button
          onClick={onRefresh}
          className="icon-action flex items-center justify-center p-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer active:scale-95"
          title="Refresh database"
          aria-label="Refresh database"
        >
          <IconLoader2 className={`h-4 w-4 ${(isLoading || isEvidenceLoading) ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}
