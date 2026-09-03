"use client";

import { IconLoader2 } from "@tabler/icons-react";

export default function SupplierAuditSkeleton() {
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full py-2 animate-fade-in">
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-sm space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] animate-pulse shrink-0">
            <div className="w-5 h-5 bg-[var(--border-subtle)]/60 rounded" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="h-5 w-64 bg-[var(--bg-input)] rounded-md animate-pulse" />
            <div className="h-3 w-80 max-w-full bg-[var(--bg-input)] rounded-md animate-pulse" />
          </div>
        </div>

        {/* Input Label & Field Skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-28 bg-[var(--bg-input)] rounded-md animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] animate-pulse flex items-center justify-between px-4">
            <div className="h-4 w-48 bg-[var(--border-subtle)]/60 rounded animate-pulse" />
            <div className="h-4 w-4 bg-[var(--border-subtle)]/60 rounded animate-pulse" />
          </div>
        </div>

        {/* Status Loading Bar */}
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-[var(--text-tertiary)] font-medium">
          <IconLoader2 className="w-4 h-4 animate-spin text-[var(--accent-primary-text)]" />
        </div>
      </section>
    </div>
  );
}
