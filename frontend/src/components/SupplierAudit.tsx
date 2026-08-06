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
import { fetchSuppliers } from "@/lib/api";

interface SupplierAuditProps {
  onNavigateToRegistry?: (supplierName: string) => void;
}

const STAGES = [
  "Extracting user input",
  "Extracting document evidence",
  "Auditing the supplier",
];

export default function SupplierAudit({ onNavigateToRegistry }: SupplierAuditProps = {}) {
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadSuppliers = useCallback(async () => {
    try {
      const supplierList = await fetchSuppliers();
      const names = Array.from(new Set(supplierList.map((s) => s.supplier_name).filter(Boolean)));
      names.sort((a, b) => a.localeCompare(b));
      setSuppliers(names);
    } catch {
      setError("Could not load supplier list. Make sure the backend is running.");
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
    return suppliers.filter((s) => s.toLowerCase().includes(q));
  }, [suppliers, query]);

  const selectSupplier = (name: string) => {
    setSelected(name);
    setQuery(name);
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

  const runVerification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || running) return;
    setError(null);
    setRunning(true);
    setStage(0);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    STAGES.forEach((_, i) => {
      timersRef.current.push(setTimeout(() => setStage(i), i * 1800));
    });
    timersRef.current.push(
      setTimeout(() => {
        setRunning(false);
        onNavigateToRegistry?.(selected);
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
              Pick a supplier from the database and run a demo verification flow.
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
                  if (selected && e.target.value !== selected) setSelected(null);
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
                    filtered.map((name, idx) => (
                      <li key={name}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected === name}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSupplier(name);
                          }}
                          onMouseEnter={() => setHighlighted(idx)}
                          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer ${highlighted === idx
                            ? "bg-[var(--accent-success-soft)] text-[var(--heading-color)]"
                            : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                            }`}
                        >
                          <IconBuildingStore className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                          <span className="truncate">{name}</span>
                          {selected === name && (
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
            disabled={!selected || running}
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
        {running && selected && (
          <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <IconLoader2 className="h-5 w-5 animate-spin text-[var(--accent-success-text)]" />
              <div>
                <p className="text-sm font-bold text-[var(--heading-color)]">Running Supplier Audit</p>
                <p className="text-xs text-[var(--text-tertiary)] truncate">Supplier: {selected}</p>
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
