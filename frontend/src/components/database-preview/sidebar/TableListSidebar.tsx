"use client";

import { useMemo, useDeferredValue } from "react";
import { IconSearch, IconLoader2, IconTable } from "@tabler/icons-react";
import type { TableListSidebarProps } from "../types";

export default function TableListSidebar({
  tables,
  tablesLoading,
  selectedTable,
  tableFilter,
  onTableFilterChange,
  onSelectTable,
}: TableListSidebarProps) {
  const deferredFilter = useDeferredValue(tableFilter);
  const filteredTables = useMemo(() => {
    const q = deferredFilter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, deferredFilter]);
  return (
    <aside className="w-64 shrink-0 flex flex-col rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] overflow-hidden sticky top-4 self-start max-h-[calc(100vh-140px)] shadow-lg">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <div className="relative">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <input
            value={tableFilter}
            onChange={(e) => onTableFilterChange(e.target.value)}
            placeholder="Filter tables…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-visible)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border)]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tablesLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-tertiary)] text-xs">
            <IconLoader2 className="w-4 h-4 animate-spin" />
            Loading tables…
          </div>
        ) : (
          <ul className="py-1">
            {filteredTables.map((t) => {
              const isActive = selectedTable === t.name;
              return (
                <li key={t.name}>
                  <button
                    onClick={() => onSelectTable(t.name)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer hover:bg-[var(--accent-primary-soft)] ${isActive
                      ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-semibold border-l-2 border-[var(--accent-primary-border)]"
                      : "text-[var(--text-secondary)] border-l-2 border-transparent"
                      }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <IconTable className="w-3.5 h-3.5 shrink-0" />
                      {t.name}
                    </span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-[var(--text-tertiary)]">
                      {t.row_count ?? "–"}
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredTables.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-[var(--text-tertiary)]">
                No tables match.
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="px-3 py-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-tertiary)]">
        {tables.length} tables · read-only
      </div>
    </aside>
  );
}