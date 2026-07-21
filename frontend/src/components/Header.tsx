"use client";

import { IconLoader2 } from "@tabler/icons-react";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  error: string | null;
  isLoading: boolean;
  isEvidenceLoading: boolean;
  onRefresh: () => void;
}

export default function Header({ error, isLoading, isEvidenceLoading, onRefresh }: HeaderProps) {
  return (
    <header className="flex justify-between items-center mb-6 pb-6 border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight text-[var(--heading-color)]">GPO Automatic Certificate Auditor</h1>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[11px] font-medium text-[var(--text-secondary)]">
          <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
          {error ? "Database Offline" : "Database Live"}
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center justify-center p-2 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer active:scale-95"
          title="Refresh database"
        >
          <IconLoader2 className={`h-4 w-4 ${(isLoading || isEvidenceLoading) ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}
