"use client";

import { IconSearch, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { DataGridHeaderProps } from "../types";

export default function DataGridHeader({
  selectedTable,
  data,
  dataLoading,
  rowSearch,
  page,
  totalPages,
  startRow,
  endRow,
  onRowSearchChange,
  onGoToPage,
}: DataGridHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
      <div>
        <h2 className="font-sans text-sm font-bold text-[var(--heading-color)]">
          {selectedTable}
        </h2>
        <p className="font-mono text-[10px] text-[var(--text-tertiary)]">
          {data ? `${startRow}–${endRow} of ${data.total} rows` : "…"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <IconSearch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={rowSearch}
            onChange={(e) => onRowSearchChange(e.target.value)}
            placeholder="Search rows..."
            className="pl-8 pr-3 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary-border)] w-36 sm:w-48"
          />
        </div>
        <button
          onClick={() => onGoToPage(page - 1)}
          disabled={page === 0 || dataLoading}
          className="p-1.5 rounded-lg border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="Previous page"
        >
          <IconChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-[10px] text-[var(--text-secondary)] w-14 text-center">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onGoToPage(page + 1)}
          disabled={page + 1 >= totalPages || dataLoading}
          className="p-1.5 rounded-lg border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="Next page"
        >
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
