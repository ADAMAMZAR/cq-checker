"use client";

import { useState, useMemo } from "react";
import { IconSearch, IconUsers } from "@tabler/icons-react";
import type { DocumentEvidence } from "@/types";

interface SupplierAuditProps {
  evidenceLogs: DocumentEvidence[];
  isEvidenceLoading: boolean;
}

export default function SupplierAudit({ evidenceLogs, isEvidenceLoading }: SupplierAuditProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const uniqueSuppliers = useMemo(
    () => Array.from(new Set(evidenceLogs.map(e => e.supplier_name))).sort(),
    [evidenceLogs]
  );

  const filtered = uniqueSuppliers.filter(name =>
    name.toLowerCase().includes(query.toLowerCase())
  );

  const showDropdown = focused && query.length > 0 && filtered.length > 0 && selected !== query;

  return (
    <div className="flex-1 flex items-start justify-center pt-24">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-3">
          <IconUsers className="h-5 w-5 text-[var(--text-tertiary)]" />
          <h2 className="text-lg font-semibold text-[var(--heading-color)] tracking-tight">
            Supplier Audit
          </h2>
        </div>

        {isEvidenceLoading ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 space-y-4 animate-pulse">
            <div className="h-3 w-24 bg-[var(--bg-surface-hover)] rounded" />
            <div className="h-10 w-full bg-[var(--bg-surface-hover)] rounded-xl" />
            <div className="h-10 w-full bg-[var(--bg-surface-hover)] rounded-xl" />
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
            <label className="block mb-2 text-xs tracking-wider text-[var(--text-secondary)] font-medium uppercase">
              Supplier Name
            </label>

            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                <IconSearch className="h-4 w-4" />
              </div>

              <input
                type="text"
                placeholder="Search supplier..."
                value={selected && query === selected ? selected : query}
                onChange={e => { setQuery(e.target.value); setSelected(null); }}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 200)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
              />

              {showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card-solid)] shadow-xl z-50 overflow-hidden animate-fade-in">
                  {filtered.map(name => (
                    <button
                      key={name}
                      onMouseDown={() => { setQuery(name); setSelected(name); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              disabled={!selected}
              className="mt-6 w-full py-2.5 rounded-xl text-sm font-semibold tracking-tight transition-all duration-200 cursor-pointer active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
            >
              Audit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
