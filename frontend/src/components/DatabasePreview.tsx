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
} from "@tabler/icons-react";
import type { DbTableMeta, DbTableData } from "@/types";
import { fetchDbTables, fetchDbTable } from "@/lib/api";

const PAGE_SIZE = 100;

export default function DatabasePreview() {
  const [tables, setTables] = useState<DbTableMeta[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("");

  const [data, setData] = useState<DbTableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

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
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold transition-all cursor-pointer"
        >
          <IconRefresh className="w-4 h-4" />
          Refresh
        </button>
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
                              className="py-1.5 px-3 align-top max-w-[360px] break-words"
                            >
                              <span className="line-clamp-3" title={cell}>
                                {cell === "" ? <span className="text-[var(--text-tertiary)]">NULL</span> : cell}
                              </span>
                            </td>
                          ))}
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
    </div>
  );
}
