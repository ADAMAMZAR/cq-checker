"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { IconAlertTriangle, IconLoader2, IconFiles } from "@tabler/icons-react";
import type {
  AuditRegistryEntry,
  AuditRegistryDetail,
  DocumentEvidence,
  SupplierAssets,
} from "@/types";
import { FIELD_NAME_TO_META_KEY } from "@/types";
import {
  fetchAuditRegistry,
  fetchAuditRegistryDetail,
  fetchSupplierAssets,
  updateEvidenceMetadata,
} from "@/lib/api";
import { formatSuggestedComment, parseEvidenceMetadata } from "@/lib/utils";
import ScreenshotLightbox from "./ScreenshotLightbox";

// Modular Sub-components
import type { StatusFilter, DetailTab } from "./audit-registry/types";
import LogListPanel from "./audit-registry/LogListPanel";
import DetailPane from "./audit-registry/DetailPane";

interface AuditRegistryProps {
  evidenceLogs: DocumentEvidence[];
  isEvidenceLoading: boolean;
  onRefreshEvidence: () => void;
  initialSupplier?: string | null;
}

export default function AuditRegistry({
  evidenceLogs,
  isEvidenceLoading,
  onRefreshEvidence,
  initialSupplier,
}: AuditRegistryProps) {
  const [logs, setLogs] = useState<AuditRegistryEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditRegistryDetail | null>(null);
  const [logDetailLoading, setLogDetailLoading] = useState(false);
  const [assets, setAssets] = useState<SupplierAssets>({ screenshots: [], documents: [] });
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("comparison");
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [activeTableIdx, setActiveTableIdx] = useState<number | null>(null);
  const [editingTableIdx, setEditingTableIdx] = useState<number | null>(null);
  const [tableEditValues, setTableEditValues] = useState<Record<number, Record<number, string>>>({});
  const [isSavingTableEdits, setIsSavingTableEdits] = useState(false);
  const [tableEditMsg, setTableEditMsg] = useState<string | null>(null);

  const auditLogsFetched = useRef(false);
  const autoSelectedSupplier = useRef<string | null>(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAuditRegistry();
      setLogs(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not establish database connection.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auditLogsFetched.current) {
      auditLogsFetched.current = true;
      loadLogs();
    }
  }, [loadLogs]);

  // Auto-open the registry log for a supplier when arriving from CQ Check.
  const autoSelectSupplierLog = useCallback(
    async (supplierName: string) => {
      const match = logs.find(
        (log) => log.supplier_name.toLowerCase() === supplierName.toLowerCase()
      );
      if (!match) return;
      autoSelectedSupplier.current = supplierName.toLowerCase();
      setSelectedLog(null);
      setLogDetailLoading(true);
      setActiveTableIdx(null);
      setAssets({ screenshots: [], documents: [] });
      setActiveTab("comparison");
      try {
        const detail = await fetchAuditRegistryDetail(match.audit_id);
        setSelectedLog(detail);
      } catch (err: unknown) {
        console.error("Failed to auto-load audit detail:", err);
      } finally {
        setLogDetailLoading(false);
      }
    },
    [logs]
  );

  useEffect(() => {
    if (!initialSupplier || logs.length === 0) return;
    if (autoSelectedSupplier.current === initialSupplier.toLowerCase()) return;
    autoSelectSupplierLog(initialSupplier);
  }, [initialSupplier, logs, autoSelectSupplierLog]);

  const handleSelectLog = async (log: AuditRegistryEntry) => {
    setSelectedLog(null);
    setLogDetailLoading(true);
    setActiveTableIdx(null);
    setAssets({ screenshots: [], documents: [] });
    setActiveTab("comparison");

    try {
      const detail = await fetchAuditRegistryDetail(log.audit_id);
      setSelectedLog(detail);
    } catch (err: unknown) {
      console.error("Failed to load audit detail:", err);
    } finally {
      setLogDetailLoading(false);
    }
  };

  const handleDetailTabChange = async (tab: DetailTab) => {
    setActiveTab(tab);
    if (tab === "assets" && selectedLog) {
      if (assets.documents.length === 0 && assets.screenshots.length === 0 && !assetsLoading) {
        setAssetsLoading(true);
        try {
          const assetsData = await fetchSupplierAssets(selectedLog.supplier_id);
          setAssets(assetsData);
        } catch (err: unknown) {
          console.error("Failed to load supplier assets:", err);
        } finally {
          setAssetsLoading(false);
        }
      }
      if (evidenceLogs.length === 0 && !isEvidenceLoading) {
        onRefreshEvidence();
      }
    }
  };

  const handleCopyComment = (comment: string) => {
    navigator.clipboard.writeText(formatSuggestedComment(comment));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startTableEdit = (tIdx: number) => {
    const table = selectedLog?.comparison_table?.tables?.[tIdx];
    if (!table) return;
    const values: Record<number, string> = {};
    table.comparison_rows?.forEach((row: { value_evidence: string }, rIdx: number) => {
      values[rIdx] = row.value_evidence;
    });
    setTableEditValues((prev) => ({ ...prev, [tIdx]: values }));
    setEditingTableIdx(tIdx);
    setTableEditMsg(null);
  };

  const updateTableEditValue = (tIdx: number, rIdx: number, value: string) => {
    setTableEditValues((prev) => ({
      ...prev,
      [tIdx]: { ...prev[tIdx], [rIdx]: value },
    }));
  };

  const refreshAll = async () => {
    await onRefreshEvidence();
    await loadLogs();
  };

  const handleSaveTableEdits = async (tIdx: number) => {
    if (!selectedLog) return;
    const table = selectedLog.comparison_table?.tables?.[tIdx];
    if (!table) return;
    const filename = table.attached_file;
    if (!filename) {
      setTableEditMsg("Cannot determine which file this field belongs to.");
      setTimeout(() => setTableEditMsg(null), 3000);
      return;
    }
    setIsSavingTableEdits(true);
    setTableEditMsg(null);
    try {
      const evRecord = evidenceLogs.find(
        (e) =>
          e.audit_id === selectedLog.audit_id &&
          e.filename.toLowerCase() === filename.toLowerCase()
      );
      if (!evRecord) throw new Error("No matching evidence record found for this file.");
      const metadata: Record<string, string> = parseEvidenceMetadata(evRecord);
      const edits = tableEditValues[tIdx] || {};

      table.comparison_rows?.forEach((row: { field_name: string; value_evidence: string }, rIdx: number) => {
        if (edits[rIdx] !== undefined && edits[rIdx] !== row.value_evidence) {
          const metaKey = FIELD_NAME_TO_META_KEY[row.field_name] || row.field_name;
          metadata[metaKey] = edits[rIdx];
        }
      });

      const responseData = await updateEvidenceMetadata(selectedLog.audit_id, filename, metadata);
      await refreshAll();

      if (responseData.comparison_table) {
        setSelectedLog((prev) =>
          prev
            ? {
                ...prev,
                result: responseData.audit_result || prev.result,
                suggested_comment: responseData.suggested_comment || prev.suggested_comment,
                comparison_table: responseData.comparison_table,
              }
            : null
        );
      }
      setEditingTableIdx(null);
      setTableEditMsg("Table values updated and comparison recalculated.");
      setTimeout(() => setTableEditMsg(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setTableEditMsg(msg);
      setTimeout(() => setTableEditMsg(null), 4000);
    } finally {
      setIsSavingTableEdits(false);
    }
  };

  // Performance Optimization: Memoize filtered supplier logs list
  const filteredLogs = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return logs.filter((log) => {
      const matchesSearch =
        log.supplier_name.toLowerCase().includes(query) ||
        (log.cert_type?.toLowerCase().includes(query) ?? false);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "MATCH" && log.result.toLowerCase() === "match") ||
        (statusFilter === "MISMATCH" && log.result.toLowerCase() === "mismatch");
      return matchesSearch && matchesStatus;
    });
  }, [logs, searchQuery, statusFilter]);

  return (
    <>
      {error && logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center double-bezel max-w-lg mx-auto my-12">
          <div className="double-bezel-inner flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-[var(--mismatch-bg)] flex items-center justify-center text-[var(--accent-danger-text)] glow-error">
              <IconAlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--heading-color)]">
              Database connection failure
            </h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm">
              We couldn&apos;t connect to the local FastAPI backend. Make sure it is running at{" "}
              <code className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--mismatch-text)] font-mono text-xs">
                http://127.0.0.1:8000
              </code>
              .
            </p>
            <button
              onClick={loadLogs}
              className="mt-2 px-5 py-2.5 rounded-full bg-[var(--bg-card-solid)] text-[var(--heading-color)] font-medium text-xs transition-all cursor-pointer active:scale-98 border border-[var(--border-subtle)]"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Panel: Supplier Log List */}
          {!selectedLog && (
            <LogListPanel
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              isLoading={isLoading}
              filteredLogs={filteredLogs}
              selectedLog={selectedLog}
              onSelectLog={handleSelectLog}
            />
          )}

          {/* Right Panel: Detail View Pane */}
          <section
            className={`${
              selectedLog || logDetailLoading ? "lg:col-span-12" : "lg:col-span-7"
            } flex flex-col double-bezel`}
          >
            <div className="double-bezel-inner flex-1 flex flex-col h-full">
              {logDetailLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 gap-3">
                  <IconLoader2 className="h-8 w-8 animate-spin text-[var(--accent-primary-text)]" />
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    Loading audit details...
                  </span>
                </div>
              ) : selectedLog ? (
                <DetailPane
                  log={selectedLog}
                  assets={assets}
                  assetsLoading={assetsLoading}
                  isEvidenceLoading={isEvidenceLoading}
                  evidenceLogs={evidenceLogs}
                  activeTab={activeTab}
                  onTabChange={handleDetailTabChange}
                  onBack={() => setSelectedLog(null)}
                  copied={copied}
                  onCopyComment={handleCopyComment}
                  activeTableIdx={activeTableIdx}
                  onTableToggle={setActiveTableIdx}
                  editingTableIdx={editingTableIdx}
                  tableEditValues={tableEditValues}
                  onStartTableEdit={startTableEdit}
                  onUpdateTableEditValue={updateTableEditValue}
                  onSaveTableEdits={handleSaveTableEdits}
                  onCancelTableEdit={() => setEditingTableIdx(null)}
                  isSavingTableEdits={isSavingTableEdits}
                  tableEditMsg={tableEditMsg}
                  selectedScreenshot={selectedScreenshot}
                  onScreenshotClick={setSelectedScreenshot}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="h-14 w-14 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] flex items-center justify-center text-[var(--text-tertiary)] mb-4">
                    <IconFiles className="h-6 w-6" />
                  </div>
                  <h3 className="text-md font-semibold text-[var(--heading-color)]">
                    Select a supplier log
                  </h3>
                  <p className="text-sm text-[var(--text-tertiary)] max-w-xs mt-1">
                    Choose an entry from the registry panel to check detail comparisons, verification
                    documents, and validation screenshots.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Lightbox for audit verification screenshots */}
      <ScreenshotLightbox
        src={selectedScreenshot}
        onClose={() => setSelectedScreenshot(null)}
      />
    </>
  );
}
