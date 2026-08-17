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
  IconEdit,
  IconCheck,
  IconFolder,
} from "@tabler/icons-react";
import type { DbTableMeta, DbTableData, DocumentFolder } from "@/types";
import {
  fetchDbTables,
  fetchDbTable,
  updateDbCell,
  deleteDbRow,
  fetchFolders,
  moveDocumentFolder,
  updateDocumentRegion,
  clearChatCache,
} from "@/lib/api";

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/60"
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

  const [rowSearch, setRowSearch] = useState("");
  const [data, setData] = useState<DbTableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expandedCell, setExpandedCell] = useState<{ column: string; rowNumber: number; value: string } | null>(null);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const [editingCell, setEditingCell] = useState<{ rIdx: number; colName: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [updatingCell, setUpdatingCell] = useState(false);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmDeleteState, setConfirmDeleteState] = useState<{ rIdx: number; pk: Record<string, string>; tableName: string } | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetchFolders();
      setFolders(res);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleFolderChange = async (docId: string, newFolderId: string) => {
    try {
      setUpdatingCell(true);
      await moveDocumentFolder(docId, newFolderId || null);
      loadFolders();
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update document folder.");
    } finally {
      setUpdatingCell(false);
    }
  };

  const handleRegionChange = async (docId: string, newRegion: string) => {
    setUpdatingCell(true);
    setError(null);
    try {
      await updateDocumentRegion(docId, newRegion);
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update document region.");
    } finally {
      setUpdatingCell(false);
    }
  };

  const handleSaveCell = async (rIdx: number, colName: string, newValue: string) => {
    if (!data) return;
    const pks = data.primary_keys ?? [];
    if (pks.length === 0) {
      setError("This table has no primary key — cannot update cell.");
      return;
    }
    const row = data.rows[rIdx];
    const pk: Record<string, string> = {};
    pks.forEach((col) => {
      const idx = data.columns.indexOf(col);
      pk[col] = row[idx] ?? "";
    });

    setUpdatingCell(true);
    setError(null);
    try {
      await updateDbCell(data.table, pk, colName, newValue);
      await loadTableData(data.table, page * PAGE_SIZE);
      setEditingCell(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update cell.");
    } finally {
      setUpdatingCell(false);
    }
  };

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

  const loadTableData = useCallback(async (table: string, offset: number, searchStr?: string) => {
    setDataLoading(true);
    setError(null);
    try {
      const result = await fetchDbTable(table, PAGE_SIZE, offset, searchStr ?? rowSearch);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load table data.");
      setData(null);
    } finally {
      setDataLoading(false);
    }
  }, [rowSearch]);

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
    setPage(0);
    setRowSearch("");
    setData(null);
    loadTableData(table, 0, "");
  };

  const handleRefresh = () => {
    loadTables();
    if (selectedTable) loadTableData(selectedTable, page * PAGE_SIZE, rowSearch);
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    setError(null);
    try {
      const cleared = await clearChatCache();
      setError(null);
      setClearingCache(false);
      setToastMsg(`Cleared ${cleared} cached query entr${cleared === 1 ? "y" : "ies"}.`);
      setTimeout(() => setToastMsg(null), 4000);
      handleRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear cache.");
      setClearingCache(false);
    }
  };

  const handlePromptDeleteRow = (rIdx: number) => {
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
    setConfirmDeleteState({ rIdx, pk, tableName: data.table });
  };

  const handleExecuteDeleteRow = async () => {
    if (!confirmDeleteState) return;
    const { rIdx, pk, tableName } = confirmDeleteState;
    setDeletingRow(rIdx);
    setError(null);
    try {
      await deleteDbRow(tableName, pk);
      setConfirmDeleteState(null);
      loadTableData(tableName, page * PAGE_SIZE);
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

      <div className="flex flex-1 gap-6 min-h-[520px] items-start">
        {/* Left: table list */}
        <aside className="w-64 shrink-0 flex flex-col rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] overflow-hidden sticky top-4 self-start max-h-[calc(100vh-140px)] shadow-lg">
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
                  <div className="relative">
                    <IconSearch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      value={rowSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRowSearch(val);
                        setPage(0);
                        if (selectedTable) loadTableData(selectedTable, 0, val);
                      }}
                      placeholder="Search rows..."
                      className="pl-8 pr-3 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary-border)] w-36 sm:w-48"
                    />
                  </div>
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
                        <th className="py-2 px-3  tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold w-10">
                          #
                        </th>
                        {data.columns.map((col) => (
                          <th
                            key={col}
                            className="py-2 px-3  tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                        <th className="py-2 px-3  tracking-wider text-[10px] text-[var(--text-tertiary)] font-bold w-12">
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
                          {row.map((cell, cIdx) => {
                            const realColName = data.columns[cIdx];
                            const normCol = (realColName ?? "").toLowerCase();
                            const isTitleCol = normCol === "title";
                            const isLongText = normCol.includes("content") || normCol.includes("text") || normCol.includes("snippet") || normCol.includes("answer") || normCol.includes("response");
                            const isNonEditable = (data.primary_keys ?? []).includes(realColName) || ["created_at", "embedding", "tsv_content"].includes(normCol);
                            const isEditableCol = !isNonEditable;
                            const isEditingThisCell = editingCell?.rIdx === rIdx && editingCell?.colName === realColName;

                            if (selectedTable === "documents" && (normCol === "folder_id" || normCol === "folder" || normCol === "folder_name")) {
                              const idColIdx = data.columns.findIndex((c) => c.toLowerCase() === "id");
                              const docId = idColIdx !== -1 ? row[idColIdx] : null;
                              const generalFolder = folders.find((f) => f.name.toLowerCase() === "general");
                              const hasGeneralInDb = !!generalFolder;
                              const currentFolderId = normCol === "folder_id" ? cell : (folders.find((f) => f.name === cell)?.id || (generalFolder ? generalFolder.id : ""));

                              return (
                                <td key={cIdx} className="py-1.5 px-2 align-middle border-b border-[var(--border-subtle)]">
                                  <select
                                    value={currentFolderId || ""}
                                    disabled={updatingCell || !docId}
                                    onChange={(e) => {
                                      if (docId) handleFolderChange(docId, e.target.value);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] text-xs font-semibold text-[var(--heading-color)] outline-none cursor-pointer focus:border-[var(--accent-primary-border)] transition-all disabled:opacity-50"
                                  >
                                    {!hasGeneralInDb && <option value="">📁 General</option>}
                                    {folders.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        📁 {f.name} ({f.document_count})
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              );
                            }

                            if (selectedTable === "documents" && normCol === "region") {
                              const idColIdx = data.columns.findIndex((c) => c.toLowerCase() === "id");
                              const docId = idColIdx !== -1 ? row[idColIdx] : null;
                              const currentRegion = (cell || "GENERAL").toUpperCase();

                              return (
                                <td key={cIdx} className="py-1.5 px-2 align-middle border-b border-[var(--border-subtle)]">
                                  <select
                                    value={currentRegion}
                                    disabled={updatingCell || !docId}
                                    onChange={(e) => {
                                      if (docId) handleRegionChange(docId, e.target.value);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary-border)] text-xs font-semibold text-[var(--heading-color)] outline-none cursor-pointer focus:border-[var(--accent-primary-border)] transition-all disabled:opacity-50"
                                  >
                                    <option value="GENERAL">🌐 GENERAL</option>
                                    <option value="VN">🇻🇳 VN (Vietnam)</option>
                                    <option value="TW">🇹🇼 TW (Taiwan)</option>
                                    <option value="MY">🇲🇾 MY (Malaysia)</option>
                                    <option value="AU">🇦🇺 AU (Australia)</option>
                                  </select>
                                </td>
                              );
                            }

                            if (isEditingThisCell) {
                              return (
                                <td key={cIdx} className="py-1 px-2 align-middle border-b border-[var(--border-subtle)]">
                                  <div className="flex items-center gap-1.5 min-w-[220px]">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveCell(rIdx, realColName, editingValue);
                                        if (e.key === "Escape") setEditingCell(null);
                                      }}
                                      className="flex-1 px-2.5 py-1 rounded bg-[var(--bg-input)] border border-[var(--accent-primary-border-focus)] text-xs font-medium text-[var(--heading-color)] focus:outline-none shadow-xs"
                                    />
                                    <button
                                      onClick={() => handleSaveCell(rIdx, realColName, editingValue)}
                                      disabled={updatingCell}
                                      className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Save (Enter)"
                                    >
                                      {updatingCell ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : <IconCheck className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                      onClick={() => handlePromptDeleteRow(rIdx)}
                                      disabled={deletingRow === rIdx}
                                      className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                                      title="Delete row"
                                    >
                                      <IconX className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={cIdx}
                                onDoubleClick={() => {
                                  if (isEditableCol) {
                                    setEditingCell({ rIdx, colName: realColName });
                                    setEditingValue(cell ?? "");
                                  } else {
                                    setExpandedCell({
                                      column: realColName,
                                      rowNumber: data.offset + rIdx + 1,
                                      value: cell ?? "",
                                    });
                                  }
                                }}
                                title={isEditableCol ? `Double-click or click edit icon to update ${realColName}` : "Double-click for enlarged view"}
                                className={`py-2 px-3 align-top group/cell ${
                                  isLongText
                                    ? "whitespace-pre-wrap break-words max-w-[500px] leading-relaxed text-xs"
                                    : "whitespace-nowrap max-w-[260px] truncate text-xs"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className={isTitleCol ? "font-semibold text-[var(--heading-color)]" : ""}>
                                    {cell === "" ? <span className="text-[var(--text-tertiary)]">NULL</span> : cell}
                                  </span>
                                  {isEditableCol && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCell({ rIdx, colName: realColName });
                                        setEditingValue(cell ?? "");
                                      }}
                                      className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-1 text-[var(--text-tertiary)] hover:text-[var(--accent-primary-text)] hover:bg-[var(--accent-primary-soft)] rounded cursor-pointer"
                                      title={`Edit ${realColName}`}
                                    >
                                      <IconEdit className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-1.5 px-3 text-center whitespace-nowrap">
                            <button
                              onClick={() => handlePromptDeleteRow(rIdx)}
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

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/30 text-xs text-emerald-300 font-semibold shadow-2xl flex items-center gap-3 animate-fade-in">
          <span>✨ {toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="p-1 hover:text-white transition-colors cursor-pointer">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {confirmDeleteState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setConfirmDeleteState(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[var(--bg-card)] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <IconTrash className="w-4 h-4" />
                <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">Confirm Row Deletion</h3>
              </div>
              <button
                onClick={() => setConfirmDeleteState(null)}
                className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)]"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Are you sure you want to delete this row from <span className="font-bold text-[var(--heading-color)]">{confirmDeleteState.tableName}</span>?
            </p>

            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-1 text-[var(--text-primary)]">
              {Object.entries(confirmDeleteState.pk).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[var(--text-tertiary)]">{k}:</span>
                  <span className="font-semibold text-amber-400 truncate">{v}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirmDeleteState(null)}
                className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDeleteRow}
                disabled={deletingRow !== null}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {deletingRow !== null ? "Deleting..." : "Delete Row"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
