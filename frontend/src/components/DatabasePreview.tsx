"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  IconDatabase,
  IconTable,
  IconLoader2,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconX,
  IconTrash,
  IconEraser,
} from "@tabler/icons-react";
import type { DbTableMeta, DbTableData } from "@/types";
import { fetchDbTables, fetchDbTable, deleteDbRow, clearChatCache } from "@/lib/api";

const PAGE_SIZE = 100;

function prettyCellValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith('"')) {
    return value;
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function CellModal({ column, rowNumber, value, onClose }: {
  column: string;
  rowNumber: number;
  value: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-4xl max-h-[85vh] rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
          <div className="min-w-0">
            <h3 className="font-sans text-sm font-bold text-[var(--heading-color)] truncate">{column}</h3>
            <p className="font-mono text-[10px] text-[var(--text-tertiary)]">Row {rowNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shrink-0"
            title="Close (Esc)"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-[var(--bg-input)]">
          <pre className="whitespace-pre-wrap break-words text-xs font-mono leading-relaxed text-[var(--text-primary)]">
            {value === "" ? <span className="text-[var(--text-tertiary)]">NULL</span> : prettyCellValue(value)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function DatabasePreview() {
  const [tables, setTables] = useState<DbTableMeta[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("");

  const [data, setData] = useState<DbTableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expandedCell, setExpandedCell] = useState<{ column: string; rowNumber: number; value: string } | null>(null);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const fetched = useRef(false);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const list = await fetchDbTables();
      setTables(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables.");
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      loadTables();
    }
  }, [loadTables]);

  const loadTableData = useCallback(async (table: string, offset: number) => {
    setDataLoading(true);
    setError(null);
    try {
      const result = await fetchDbTable(table, PAGE_SIZE, offset);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load table data.");
      setData(null);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
    setPage(0);
    setData(null);
    loadTableData(table, 0);
  };

  const handleRefresh = () => {
    loadTables();
    if (selectedTable) loadTableData(selectedTable, page * PAGE_SIZE);
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    setError(null);
    try {
      const cleared = await clearChatCache();
      setError(null);
      setClearingCache(false);
      window.alert(`Cleared ${cleared} cached query entr${cleared === 1 ? "y" : "ies"}.`);
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear cache.");
      setClearingCache(false);
    }
  };

  const handleDeleteRow = async (rIdx: number) => {
    if (!data) return;
    const pks = data.primary_keys ?? [];
    if (pks.length === 0) {
      setError("This table has no primary key — cannot delete rows.");
      return;
    }
    const row = data.rows[rIdx];
    const pk: Record<string, string> = {};
    pks.forEach((col) => {
      const idx = data.columns.indexOf(col);
      pk[col] = row[idx] ?? "";
    });
    const confirmText = `Delete this row from "${data.table}"?\n\n${pks.map((c) => `${c}: ${pk[c]}`).join("\n")}`;
    if (!window.confirm(confirmText)) return;
    setDeletingRow(rIdx);
    setError(null);
    try {
      await deleteDbRow(data.table, pk);
      loadTableData(data.table, page * PAGE_SIZE);
      loadTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete row.");
    } finally {
      setDeletingRow(null);
    }
  };

  const goToPage = (next: number) => {
    if (!selectedTable || next < 0) return;
    const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
    if (next >= totalPages) return;
    setPage(next);
    loadTableData(selectedTable, next * PAGE_SIZE);
  };

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableFilter.toLowerCase())
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const startRow = data ? data.offset + 1 : 0;
  const endRow = data ? Math.min(data.offset + data.rows.length, data.total) : 0;

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
            <IconDatabase className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-sans text-lg font-bold text-[var(--heading-color)]">
              Database Preview
            </h1>
            <p className="font-serif text-xs text-[var(--text-secondary)]">
              Read-only view of every table. Select a table on the left.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearCache}
            disabled={clearingCache}
            title="Clear the RAG semantic query cache (query_cache table)"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconEraser className="w-4 h-4" />
            {clearingCache ? "Clearing…" : "Clear cache"}
          </button>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold transition-all cursor-pointer"
          >
            <IconRefresh className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex flex-1 gap-6 min-h-[520px]">
        {/* Left: table list */}
        <aside className="w-64 shrink-0 flex flex-col rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] overflow-hidden">
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
              <input
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
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
                        onClick={() => handleSelectTable(t.name)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer hover:bg-[var(--accent-primary-soft)] ${
                          isActive
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

        {/* Right: data grid */}
        <section className="flex-1 min-w-0 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] overflow-hidden flex flex-col">
          {!selectedTable ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <IconTable className="w-10 h-10 text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-secondary)]">
                Select a table from the left panel to preview its data.
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
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
                  <button
                    onClick={() => goToPage(page - 1)}
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
                    onClick={() => goToPage(page + 1)}
                    disabled={page + 1 >= totalPages || dataLoading}
                    className="p-1.5 rounded-lg border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title="Next page"
                  >
                    <IconChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-auto">
                {dataLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-tertiary)] text-xs">
                    <IconLoader2 className="w-4 h-4 animate-spin" />
                    Loading {selectedTable}…
                  </div>
                ) : data && data.columns.length > 0 ? (
                  <table className="w-full text-left text-xs font-sans text-[var(--text-primary)] border-collapse">
                    <thead className="sticky top-0 z-10 bg-[var(--bg-card)]">
                      <tr className="border-b border-[var(--border-subtle)]">
                        <th className="py-2 px-3 uppercase tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold w-10">
                          #
                        </th>
                        {data.columns.map((col) => (
                          <th
                            key={col}
                            className="py-2 px-3 uppercase tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                        <th className="py-2 px-3 uppercase tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold w-12">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="border-b border-[var(--border-subtle)] hover:bg-[var(--accent-primary-soft)] transition-colors"
                        >
                          <td className="py-1.5 px-3 font-mono text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
                            {data.offset + rIdx + 1}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              onDoubleClick={() =>
                                setExpandedCell({
                                  column: data.columns[cIdx],
                                  rowNumber: data.offset + rIdx + 1,
                                  value: cell ?? "",
                                })
                              }
                              title="Double-click to enlarge"
                              className="py-1.5 px-3 align-top max-w-[360px] break-words cursor-zoom-in"
                            >
                              <span className="line-clamp-3">
                                {cell === "" ? <span className="text-[var(--text-tertiary)]">NULL</span> : cell}
                              </span>
                            </td>
                          ))}
                          <td className="py-1.5 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteRow(rIdx)}
                              disabled={deletingRow === rIdx}
                              title="Delete this row"
                              className="inline-flex items-center justify-center p-1.5 rounded-lg border border-transparent text-[var(--text-tertiary)] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {deletingRow === rIdx ? (
                                <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <IconTrash className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : data ? (
                  <div className="flex items-center justify-center py-10 text-xs text-[var(--text-tertiary)]">
                    No renderable columns (vector/text-search columns only).
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      {expandedCell && (
        <CellModal
          column={expandedCell.column}
          rowNumber={expandedCell.rowNumber}
          value={expandedCell.value}
          onClose={() => setExpandedCell(null)}
        />
      )}
    </div>
  );
}
