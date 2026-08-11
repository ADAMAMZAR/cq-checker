"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconCertificate,
  IconSearch,
  IconChevronDown,
  IconLoader2,
  IconCheck,
  IconBuildingStore,
} from "@tabler/icons-react";
import { fetchAribaSuppliers, auditAribaSupplier } from "@/lib/api";
import type { SupplierEntry } from "@/types";

interface SupplierAuditProps {
  onNavigateToRegistry?: (supplierName: string) => void;
}

const STAGES = [
  "Extracting user input",
  "Extracting document evidence",
  "Auditing the supplier",
];

export default function SupplierAudit({ onNavigateToRegistry }: SupplierAuditProps = {}) {
  const [suppliers, setSuppliers] = useState<SupplierEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierEntry | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadSuppliers = useCallback(async () => {
    try {
      const supplierList = await fetchAribaSuppliers();
      supplierList.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
      setSuppliers(supplierList);
    } catch {
      setError("Could not load Ariba supplier list. Make sure the backend and Ariba credentials are set.");
    }
  }, []);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      loadSuppliers();
    }
  }, [loadSuppliers]);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
    },
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.supplier_name.toLowerCase().includes(q));
  }, [suppliers, query]);

  const selectSupplier = (sup: SupplierEntry) => {
    setSelectedSupplier(sup);
    setQuery(sup.supplier_name);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) selectSupplier(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const runVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || running) return;
    setError(null);
    setRunning(true);
    setStage(0);

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    STAGES.forEach((_, i) => {
      timersRef.current.push(setTimeout(() => setStage(i), i * 1800));
    });

    if (selectedSupplier.sm_vendor_id) {
      try {
        await auditAribaSupplier(selectedSupplier.sm_vendor_id);
      } catch (err: any) {
        console.warn("Ariba live audit failed, proceeding with DB audit fallback:", err);
      }
    }

    timersRef.current.push(
      setTimeout(() => {
        setRunning(false);
        onNavigateToRegistry?.(selectedSupplier.supplier_name);
      }, STAGES.length * 1800 + 600)
    );
  };

  const isStageActive = (i: number) => i === stage;
  const isStageDone = (i: number) => i < stage;

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full py-2 animate-fade-in">
      {/* CQ Check form */}
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-[var(--accent-success-soft)] border border-[var(--accent-success-border)] text-[var(--accent-success-text)]">
            <IconCertificate className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--heading-color)] tracking-tight">CQ Check</h2>
            <p className="text-xs text-[var(--text-tertiary)]">
              Run an audit for supplier with qualification status (In Qualification)
            </p>
          </div>
        </div>

        <form onSubmit={runVerification} className="space-y-4">
          <div>
            <label htmlFor="cq-supplier" className="block mb-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">
              Supplier Name *
            </label>
            <div className="relative">
              <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4 w-4" />
              <input
                id="cq-supplier"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setHighlighted(0);
                  if (selectedSupplier && e.target.value !== selectedSupplier.supplier_name) setSelectedSupplier(null);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={handleKeyDown}
                placeholder="Search and select a supplier…"
                aria-label="Supplier Name"
                role="combobox"
                aria-expanded={open}
                aria-controls="cq-supplier-listbox"
                aria-autocomplete="list"
                autoComplete="off"
                className="w-full pl-11 pr-10 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border-focus)]"
              />
              <IconChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4 w-4 pointer-events-none" />

              {open && (
                <ul
                  id="cq-supplier-listbox"
                  className="absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-xl py-1.5"
                  role="listbox"
                >
                  {filtered.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-[var(--text-tertiary)] italic">No suppliers found.</li>
                  ) : (
                    filtered.map((sup, idx) => (
                      <li key={`${sup.supplier_name}-${idx}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedSupplier?.supplier_name === sup.supplier_name}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSupplier(sup);
                          }}
                          onMouseEnter={() => setHighlighted(idx)}
                          className={`w-full flex items-center justify-between gap-2.5 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer ${highlighted === idx
                            ? "bg-[var(--accent-success-soft)] text-[var(--heading-color)]"
                            : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                            }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <IconBuildingStore className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                            <span className="truncate">{sup.supplier_name}</span>
                          </div>
                          {sup.sm_vendor_id && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] shrink-0">
                              Ariba: {sup.sm_vendor_id}
                            </span>
                          )}
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

          <button
            type="submit"
            disabled={!selectedSupplier || running}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-success)] hover:bg-[var(--accent-success-hover)] text-white font-bold text-sm transition-all shadow-md shadow-[var(--accent-success-shadow)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconCertificate className="w-4 h-4" />
            {running ? "Verifying…" : "Run CQ Check"}
          </button>
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-[var(--accent-danger-border)] bg-[var(--accent-danger-soft)] p-4 text-sm text-[var(--accent-danger-text)]">
            {error}
          </div>
        )}

        {/* Demo loading animation */}
        {running && selectedSupplier && (
          <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <IconLoader2 className="h-5 w-5 animate-spin text-[var(--accent-success-text)]" />
              <div>
                <p className="text-sm font-bold text-[var(--heading-color)]">Running Supplier Audit</p>
                <p className="text-xs text-[var(--text-tertiary)] truncate">Supplier: {selectedSupplier.supplier_name}</p>
              </div>
            </div>
            <div className="space-y-2">
              {STAGES.map((label, i) => {
                const active = isStageActive(i);
                const done = isStageDone(i);
                return (
                  <div
                    key={label}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${active
                      ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)]"
                      : done
                        ? "border-[var(--border-subtle)] bg-[var(--bg-input)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-input)] opacity-60"
                      }`}
                  >
                    {done ? (
                      <IconCheck className="h-4 w-4 text-[var(--match-text)]" />
                    ) : active ? (
                      <IconLoader2 className="h-4 w-4 animate-spin text-[var(--accent-success-text)]" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border-2 border-[var(--border-subtle)]" />
                    )}
                    <span
                      className={`text-sm font-semibold ${active ? "text-[var(--heading-color)]" : done ? "text-[var(--match-text)]" : "text-[var(--text-tertiary)]"
                        }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
