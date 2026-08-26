"use client";

import { IconHome } from "@tabler/icons-react";
import UserNav from "./UserNav";

interface HeaderProps {
  error: string | null;
  isLoading: boolean;
  isEvidenceLoading: boolean;
  onRefresh: () => void;
  onGoHome?: () => void;
  hideHomeIcon?: boolean;
}

export default function Header({ onGoHome, hideHomeIcon }: HeaderProps) {
  const isClickable = Boolean(onGoHome);
  const showHomeIcon = Boolean(onGoHome) && !hideHomeIcon;

  return (
    <header className="sticky top-0 z-40 -mx-4 -mt-4 md:-mx-8 md:-mt-8 px-4 md:px-8 py-2.5 mb-4 flex justify-between items-center bg-[var(--bg-page)] border-b border-[var(--border-subtle)] transition-all">
      {isClickable ? (
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2.5 text-left cursor-pointer group"
          title="Return to Main Home"
          aria-label="Return to Main Home"
        >
          {showHomeIcon && (
            <div className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] group-hover:scale-105 transition-transform">
              <IconHome className="h-4 w-4" />
            </div>
          )}
          <h1 className="font-sans text-sm sm:text-base font-bold tracking-tight text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)] transition-colors">
            Gamuda Group Procurement Office
          </h1>
        </button>
      ) : (
        <div className="flex items-center gap-2.5">
          {showHomeIcon && (
            <div className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
              <IconHome className="h-4 w-4" />
            </div>
          )}
          <h1 className="font-sans text-sm sm:text-base font-bold tracking-tight text-[var(--heading-color)]">
            Gamuda Group Procurement Office
          </h1>
        </div>
      )}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <UserNav />
      </div>
    </header>
  );
}
