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
      </div>
    </header>
  );
}
