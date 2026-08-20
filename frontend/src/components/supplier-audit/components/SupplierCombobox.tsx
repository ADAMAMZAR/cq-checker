"use client";

import {
  IconCertificate,
  IconSearch,
  IconChevronDown,
  IconCheck,
  IconInfoCircle,
} from "@tabler/icons-react";
import type { SupplierComboboxProps } from "../types";

export default function SupplierCombobox({
  query,
  open,
  highlighted,
  filtered,
  selectedSupplier,
  error,
  onQueryChange,
  onOpenChange,
  onHighlightedChange,
  onSelectSupplier,
  onSubmit,
}: SupplierComboboxProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onOpenChange(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onHighlightedChange(Math.min(highlighted + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onHighlightedChange(Math.max(highlighted - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) onSelectSupplier(filtered[highlighted]);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-xl bg-[var(--accent-success-soft)] border border-[var(--accent-success-border)] text-[var(--accent-success-text)]">
          <IconCertificate className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--heading-color)] tracking-tight">
            CQ Checker
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Search by supplier name or SM Vendor ID to retrieve live Ariba questionnaires & answers
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="cq-supplier"
            className="block mb-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]"
          >
            Search Supplier *
          </label>
          <div className="relative">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4 w-4" />
            <input
              id="cq-supplier"
              type="text"
              value={query}
              onChange={(e) => {
                onQueryChange(e.target.value);
                onOpenChange(true);
                onHighlightedChange(0);
              }}
              onFocus={() => onOpenChange(true)}
              onBlur={() => setTimeout(() => onOpenChange(false), 200)}
              onKeyDown={handleKeyDown}
              placeholder="Type letter or vendor ID"
              aria-label="Supplier Name"
              role="combobox"
              aria-expanded={open}
              aria-controls="cq-supplier-listbox"
              aria-autocomplete="list"
              autoComplete="off"
              className="w-full pl-11 pr-10 py-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border-focus)] transition-all"
            />
            <IconChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4 w-4 pointer-events-none" />

            {open && (
              <ul
                id="cq-supplier-listbox"
                className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl py-1.5"
                role="listbox"
              >
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-[var(--text-tertiary)] italic">
                    No matching suppliers found. Type to search live Ariba database.
                  </li>
                ) : (
                  filtered.map((sup, idx) => (
                    <li key={`${sup.supplier_name}-${sup.sm_vendor_id || idx}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedSupplier?.supplier_name === sup.supplier_name}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectSupplier(sup);
                        }}
                        onMouseEnter={() => onHighlightedChange(idx)}
                        className={`w-full flex items-center justify-between gap-2.5 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer ${
                          highlighted === idx
                            ? "bg-[var(--accent-success-soft)] text-[var(--heading-color)]"
                            : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="truncate font-medium">{sup.supplier_name}</span>
                        </div>
                        {selectedSupplier?.supplier_name === sup.supplier_name && (
                          <IconCheck className="ml-auto h-4 w-4 shrink-0 text-[var(--match-text)]" />
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-[var(--accent-danger-border)] bg-[var(--accent-danger-soft)] p-4 text-sm text-[var(--accent-danger-text)] flex items-center gap-2">
          <IconInfoCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
