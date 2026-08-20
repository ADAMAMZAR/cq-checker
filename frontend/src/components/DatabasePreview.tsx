"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  IconDatabase,
  IconTable,
  IconLoader2,
  IconRefresh,
  IconEraser,
  IconX,
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

import type { EditingCell, ExpandedCell, ConfirmDeleteState } from "./database-preview/types";
import TableListSidebar from "./database-preview/sidebar/TableListSidebar";
import DataGridHeader from "./database-preview/grid/DataGridHeader";
import DataGridTable from "./database-preview/grid/DataGridTable";
import CellModal from "./database-preview/modals/CellModal";
import ConfirmDeleteModal from "./database-preview/modals/ConfirmDeleteModal";

const PAGE_SIZE = 100;

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

  const [expandedCell, setExpandedCell] = useState<ExpandedCell | null>(null);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [updatingCell, setUpdatingCell] = useState(false);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmDeleteState, setConfirmDeleteState] = useState<ConfirmDeleteState | null>(null);

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

  const loadTableData = useCallback(
    async (table: string, offset: number, searchStr?: string) => {
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
    },
    [rowSearch]
  );

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

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const startRow = data ? data.offset + 1 : 0;
  const endRow = data ? Math.min(data.offset + data.rows.length, data.total) : 0;

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fade-in">
      {/* Top Header Controls */}
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
        {/* Left Table Sidebar */}
        <TableListSidebar
          tables={tables}
          tablesLoading={tablesLoading}
          selectedTable={selectedTable}
          tableFilter={tableFilter}
          onTableFilterChange={setTableFilter}
          onSelectTable={handleSelectTable}
        />

        {/* Right Data Grid Section */}
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
              {/* Grid Header */}
              <DataGridHeader
                selectedTable={selectedTable}
                data={data}
                dataLoading={dataLoading}
                rowSearch={rowSearch}
                page={page}
                totalPages={totalPages}
                startRow={startRow}
                endRow={endRow}
                onRowSearchChange={(val) => {
                  setRowSearch(val);
                  setPage(0);
                  if (selectedTable) loadTableData(selectedTable, 0, val);
                }}
                onGoToPage={goToPage}
              />

              {/* Grid Body Table */}
              <div className="flex-1 overflow-auto">
                {dataLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-[var(--text-tertiary)] text-xs">
                    <IconLoader2 className="w-4 h-4 animate-spin" />
                    Loading {selectedTable}…
                  </div>
                ) : data && data.columns.length > 0 ? (
                  <DataGridTable
                    selectedTable={selectedTable}
                    data={data}
                    folders={folders}
                    updatingCell={updatingCell}
                    deletingRow={deletingRow}
                    editingCell={editingCell}
                    editingValue={editingValue}
                    onSetEditingValue={setEditingValue}
                    onSetEditingCell={setEditingCell}
                    onSaveCell={handleSaveCell}
                    onPromptDeleteRow={handlePromptDeleteRow}
                    onSetExpandedCell={setExpandedCell}
                    onFolderChange={handleFolderChange}
                    onRegionChange={handleRegionChange}
                  />
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

      {/* Expanded Cell View Modal */}
      {expandedCell && (
        <CellModal
          column={expandedCell.column}
          rowNumber={expandedCell.rowNumber}
          value={expandedCell.value}
          onClose={() => setExpandedCell(null)}
        />
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/30 text-xs text-emerald-300 font-semibold shadow-2xl flex items-center gap-3 animate-fade-in">
          <span>✨ {toastMsg}</span>
          <button
            onClick={() => setToastMsg(null)}
            className="p-1 hover:text-white transition-colors cursor-pointer"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Delete Row Confirmation Modal */}
      {confirmDeleteState && (
        <ConfirmDeleteModal
          confirmDeleteState={confirmDeleteState}
          deletingRow={deletingRow}
          onClose={() => setConfirmDeleteState(null)}
          onExecuteDelete={handleExecuteDeleteRow}
        />
      )}
    </div>
  );
}