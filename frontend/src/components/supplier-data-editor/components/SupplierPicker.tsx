"use client";

import { IconSearch } from "@tabler/icons-react";
import type { SupplierPickerProps } from "../types";

export default function SupplierPicker({
  searchQuery,
  onSearchChange,
  isLoading,
  suppliers,
  onSelect,
}: SupplierPickerProps) {
  return (
    <>
      <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
        Supplier Registry
      </h3>
      <div className="relative mb-6">
        <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4.5 w-4.5" />
        <input
          type="text"
          placeholder="Search supplier..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search suppliers"
          className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 max-h-none lg:max-h-[480px] pr-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse"
            >
              <div className="h-4 w-3/4 bg-[var(--bg-surface-hover)] rounded mb-2" />
            </div>
          ))
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-tertiary)]">
            <p className="text-sm">No suppliers found.</p>
          </div>
        ) : (
          suppliers.map((sup) => (
            <button
              key={sup.supplier_id}
              type="button"
              onClick={() => onSelect(sup)}
              className="w-full text-left p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-success)] hover:bg-[var(--accent-success-soft)] transition-all duration-300 cursor-pointer flex justify-between items-center"
            >
              <h4 className="font-semibold text-sm text-[var(--heading-color)]">
                {sup.supplier_name}
              </h4>
            </button>
          ))
        )}
      </div>
    </>
  );
}
