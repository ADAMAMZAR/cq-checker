"use client";

import { IconSearch } from "@tabler/icons-react";
import type { LogListPanelProps, StatusFilter } from "./types";

const STATUS_FILTERS: StatusFilter[] = ["ALL", "MATCH", "MISMATCH"];

export default function LogListPanel({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  isLoading,
  filteredLogs,
  selectedLog,
  onSelectLog,
}: LogListPanelProps) {
  return (
    <section className="lg:col-span-5 flex flex-col min-h-0 lg:min-h-[600px] double-bezel">
      <div className="double-bezel-inner flex-1 flex flex-col h-full">
        {/* Search & Filter Controls */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4.5 w-4.5" />
            <input
              type="text"
              placeholder="Search supplier"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search suppliers"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
            />
          </div>

          <div className="flex gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => onStatusFilterChange(f)}
                className={`icon-action px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${
                  statusFilter === f
                    ? "bg-[var(--accent-success-soft)] text-[var(--match-text)] border border-[var(--match-border)] shadow-md"
                    : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Supplier List */}
        <div className="flex-1 overflow-y-auto space-y-3 max-h-none lg:max-h-[620px] pr-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse"
              >
                <div className="h-4 w-3/4 bg-[var(--bg-surface-hover)] rounded mb-2" />
                <div className="h-3 w-1/2 bg-[var(--bg-surface-hover)] rounded" />
              </div>
            ))
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-tertiary)]">
              <p className="text-sm">No audit logs match current filters.</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => {
              const isSelected =
                selectedLog?.timestamp === log.timestamp &&
                selectedLog?.supplier_name === log.supplier_name;
              const isMatch = log.result.toLowerCase() === "match";

              return (
                <button
                  key={`${log.timestamp}-${log.supplier_name}`}
                  type="button"
                  onClick={() => onSelectLog(log)}
                  style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                  className={`rise-in group w-full text-left p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                    isSelected
                      ? "bg-[var(--bg-surface-hover)] border-[var(--match-border)] glow-success"
                      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--accent-success)] hover:bg-[var(--accent-success-soft)]"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-sm text-[var(--heading-color)] group-hover:text-[var(--match-text)] transition-colors">
                      {log.supplier_name}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shrink-0 ${
                        isMatch
                          ? "bg-[var(--match-bg)] text-[var(--match-text)] border border-[var(--match-border)]"
                          : "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)] border border-[var(--mismatch-border)]"
                      }`}
                    >
                      {log.result}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
