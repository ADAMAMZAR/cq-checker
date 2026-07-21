"use client";

import { useState, useEffect, useCallback } from "react";
import {
  IconSearch, IconCopy, IconCheck, IconAlertTriangle, IconCircleCheck,
  IconExternalLink, IconLoader2, IconPhoto, IconArrowUpRight, IconEdit,
  IconChevronDown, IconChevronLeft, IconFiles, IconX
} from "@tabler/icons-react";
import type { AuditLog, DocumentEvidence, SupplierAssets, ComparisonTable } from "@/types";
import { FIELD_NAME_TO_META_KEY, INITIAL_FORM_FIELDS } from "@/types";
import { fetchAuditLogs, fetchSupplierAssets, fetchEvidenceLogs, updateEvidenceMetadata } from "@/lib/api";
import { getCommentAndTable, cleanQuestionLabel, getLabelSortKey, parseEvidenceMetadata } from "@/lib/utils";
import ScreenshotLightbox from "./ScreenshotLightbox";

interface AuditRegistryProps {
  evidenceLogs: DocumentEvidence[];
  isEvidenceLoading: boolean;
  onRefreshEvidence: () => void;
  onRefreshLogs: () => void;
}

export default function AuditRegistry({ evidenceLogs, isEvidenceLoading, onRefreshEvidence, onRefreshLogs }: AuditRegistryProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [assets, setAssets] = useState<SupplierAssets>({ screenshots: [], documents: [] });
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MATCH" | "MISMATCH">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"comparison" | "assets">("comparison");
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [activeTableIdx, setActiveTableIdx] = useState<number | null>(null);
  const [expandedQaIdx, setExpandedQaIdx] = useState<number | null>(0);
  const [editingTableIdx, setEditingTableIdx] = useState<number | null>(null);
  const [tableEditValues, setTableEditValues] = useState<Record<number, Record<number, string>>>({});
  const [isSavingTableEdits, setIsSavingTableEdits] = useState(false);
  const [tableEditMsg, setTableEditMsg] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLogs();
      setLogs(data);
    } catch (err: any) {
      setError(err.message || "Could not establish database connection.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs() }, [loadLogs]);

  const handleSelectLog = async (log: AuditLog) => {
    setSelectedLog(log);
    setActiveTableIdx(null);
    setExpandedQaIdx(0);
    setAssets({ screenshots: [], documents: [] });
    setAssetsLoading(true);
    setActiveTab("comparison");
    const data = await fetchSupplierAssets(log.supplier_name);
    setAssets(data);
    setAssetsLoading(false);
  };

  const handleCopyComment = (comment: string) => {
    navigator.clipboard.writeText(comment);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startTableEdit = (tIdx: number) => {
    const table = selectedLog?.comparison_table?.tables?.[tIdx];
    if (!table) return;
    const values: Record<number, string> = {};
    table.comparison_rows.forEach((row: any, rIdx: number) => {
      values[rIdx] = row.value_evidence;
    });
    setTableEditValues(prev => ({ ...prev, [tIdx]: values }));
    setEditingTableIdx(tIdx);
    setTableEditMsg(null);
  };

  const updateTableEditValue = (tIdx: number, rIdx: number, value: string) => {
    setTableEditValues(prev => ({
      ...prev,
      [tIdx]: { ...prev[tIdx], [rIdx]: value }
    }));
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
      const evRecord = evidenceLogs.find(e =>
        e.audit_id === selectedLog.audit_id &&
        e.filename.toLowerCase() === filename.toLowerCase()
      );
      if (!evRecord) throw new Error("No matching evidence record found for this file.");
      let metadata: Record<string, string> = {};
      try { metadata = JSON.parse(evRecord.gemini_extracted_metadata); } catch { metadata = {}; }
      const edits = tableEditValues[tIdx] || {};
      table.comparison_rows.forEach((row: any, rIdx: number) => {
        if (edits[rIdx] !== undefined && edits[rIdx] !== row.value_evidence) {
          const metaKey = FIELD_NAME_TO_META_KEY[row.field_name] || row.field_name;
          metadata[metaKey] = edits[rIdx];
        }
      });
      const responseData = await updateEvidenceMetadata(selectedLog.audit_id, filename, metadata);
      await refreshAll();
      if (responseData.comparison_table) {
        setSelectedLog(prev => prev ? ({
          ...prev,
          result: responseData.audit_result || prev.result,
          suggested_comment: responseData.suggested_comment || prev.suggested_comment,
          comparison_table: responseData.comparison_table
        }) : null);
      }
      setEditingTableIdx(null);
      setTableEditMsg("Table values updated and comparison recalculated.");
      setTimeout(() => setTableEditMsg(null), 3000);
    } catch (err: any) {
      setTableEditMsg(err.message || "Save failed.");
      setTimeout(() => setTableEditMsg(null), 4000);
    } finally {
      setIsSavingTableEdits(false);
    }
  };

  const refreshAll = async () => {
    await onRefreshLogs();
    await onRefreshEvidence();
    await loadLogs();
  };

  const getFilteredLogs = () => logs.filter(log => {
    const matchesSearch = log.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.cert_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" ||
      (statusFilter === "MATCH" && log.result.toLowerCase() === "match") ||
      (statusFilter === "MISMATCH" && log.result.toLowerCase() === "mismatch");
    return matchesSearch && matchesStatus;
  });

  const filteredLogs = getFilteredLogs();

  return (
    <>
      {error && logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center double-bezel max-w-lg mx-auto my-12">
          <div className="double-bezel-inner flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-[var(--mismatch-bg)] flex items-center justify-center text-rose-500 glow-error">
              <IconAlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--heading-color)]">Database connection failure</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm">
              We couldn't connect to the local Google Sheets database server. Make sure your FastAPI backend API is running at <code className="px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--mismatch-text)] font-mono text-xs">http://127.0.0.1:8000</code>.
            </p>
            <button onClick={loadLogs} className="mt-2 px-5 py-2.5 rounded-full bg-[var(--bg-card-solid)] hover:bg-[var(--bg-card-solid)] text-[var(--heading-color)] font-medium text-xs transition-all cursor-pointer active:scale-98 border border-[var(--border-subtle)]">
              Retry Connection
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left: Log List */}
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

          {/* Right: Detail Pane */}
          <section className={`${selectedLog ? "lg:col-span-12" : "lg:col-span-7"} flex flex-col double-bezel`}>
            <div className="double-bezel-inner flex-1 flex flex-col h-full">
              {selectedLog ? (
                <DetailPane
                  log={selectedLog}
                  assets={assets}
                  assetsLoading={assetsLoading}
                  evidenceLogs={evidenceLogs}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
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
                  <h3 className="text-md font-semibold text-[var(--heading-color)]">Select a supplier log</h3>
                  <p className="text-sm text-[var(--text-tertiary)] max-w-xs mt-1">
                    Choose an entry from the registry panel to check detail comparisons, verification documents, and validation screenshots.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      <ScreenshotLightbox src={selectedScreenshot} onClose={() => setSelectedScreenshot(null)} />
    </>
  );
}

/* ─── Subcomponents ─── */

function LogListPanel({
  searchQuery, onSearchChange, statusFilter, onStatusFilterChange,
  isLoading, filteredLogs, selectedLog, onSelectLog
}: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  statusFilter: "ALL" | "MATCH" | "MISMATCH";
  onStatusFilterChange: (v: "ALL" | "MATCH" | "MISMATCH") => void;
  isLoading: boolean;
  filteredLogs: AuditLog[];
  selectedLog: AuditLog | null;
  onSelectLog: (log: AuditLog) => void;
}) {
  return (
    <section className="lg:col-span-5 flex flex-col min-h-[600px] double-bezel">
      <div className="double-bezel-inner flex-1 flex flex-col h-full">
        <div className="mb-6 space-y-4">
          <div className="relative">
            <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4.5 w-4.5" />
            <input
              type="text" placeholder="Search supplier" value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
            />
          </div>
          <div className="flex gap-2">
            {(["ALL", "MATCH", "MISMATCH"] as const).map(f => (
              <button key={f} onClick={() => onStatusFilterChange(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${statusFilter === f
                  ? "bg-emerald-600/10 text-[var(--match-text)] border border-[var(--match-border)] shadow-md"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
                  }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 max-h-[620px] pr-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse">
                <div className="h-4 w-3/4 bg-[var(--bg-surface-hover)] rounded mb-2"></div>
                <div className="h-3 w-1/2 bg-[var(--bg-surface-hover)] rounded"></div>
              </div>
            ))
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-tertiary)]"><p className="text-sm">No audit logs match current filters.</p></div>
          ) : (
            filteredLogs.map((log) => {
              const isSelected = selectedLog?.timestamp === log.timestamp && selectedLog?.supplier_name === log.supplier_name;
              const isMatch = log.result.toLowerCase() === "match";
              return (
                <div key={`${log.timestamp}-${log.supplier_name}`}
                  onClick={() => onSelectLog(log)}
                  className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer relative group overflow-hidden ${isSelected
                    ? "bg-[var(--bg-surface-hover)] border-[var(--match-border)] glow-success"
                    : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)]"
                    }`}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-sm text-[var(--heading-color)] group-hover:text-[var(--match-text)] transition-colors">{log.supplier_name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shrink-0 ${isMatch
                      ? "bg-[var(--match-bg)] text-[var(--match-text)] border border-[var(--match-border)]"
                      : "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)] border border-[var(--mismatch-border)]"
                      }`}>
                      {log.result}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function DetailPane({
  log, assets, assetsLoading, evidenceLogs, activeTab, onTabChange, onBack,
  copied, onCopyComment,
  activeTableIdx, onTableToggle,
  editingTableIdx, tableEditValues, onStartTableEdit, onUpdateTableEditValue,
  onSaveTableEdits, onCancelTableEdit, isSavingTableEdits, tableEditMsg,
  selectedScreenshot, onScreenshotClick
}: {
  log: AuditLog;
  assets: SupplierAssets;
  assetsLoading: boolean;
  evidenceLogs: DocumentEvidence[];
  activeTab: "comparison" | "assets";
  onTabChange: (t: "comparison" | "assets") => void;
  onBack: () => void;
  copied: boolean;
  onCopyComment: (c: string) => void;
  activeTableIdx: number | null;
  onTableToggle: (idx: number | null) => void;
  editingTableIdx: number | null;
  tableEditValues: Record<number, Record<number, string>>;
  onStartTableEdit: (idx: number) => void;
  onUpdateTableEditValue: (tIdx: number, rIdx: number, v: string) => void;
  onSaveTableEdits: (idx: number) => void;
  onCancelTableEdit: () => void;
  isSavingTableEdits: boolean;
  tableEditMsg: string | null;
  selectedScreenshot: string | null;
  onScreenshotClick: (url: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-[var(--border-subtle)] gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--heading-color)] transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <IconChevronLeft className="h-4 w-4" />
            Back to List
          </button>
          <h2 className="text-xl font-bold text-[var(--heading-color)] tracking-tight">{log.supplier_name}</h2>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-[var(--border-subtle)]">
        <button onClick={() => onTabChange("comparison")}
          className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${activeTab === "comparison"
            ? "border-emerald-500 text-[var(--heading-color)] font-bold"
            : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
        >Audit Results</button>
        <button onClick={() => onTabChange("assets")}
          className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${activeTab === "assets"
            ? "border-emerald-500 text-[var(--heading-color)] font-bold"
            : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
        >Evidence</button>
      </div>

      {activeTab === "comparison" ? (
        <ComparisonTab
          log={log} assets={assets}
          copied={copied} onCopyComment={onCopyComment}
          activeTableIdx={activeTableIdx} onTableToggle={onTableToggle}
          editingTableIdx={editingTableIdx} tableEditValues={tableEditValues}
          onStartTableEdit={onStartTableEdit} onUpdateTableEditValue={onUpdateTableEditValue}
          onSaveTableEdits={onSaveTableEdits} onCancelTableEdit={onCancelTableEdit}
          isSavingTableEdits={isSavingTableEdits} tableEditMsg={tableEditMsg}
        />
      ) : (
        <EvidenceTab
          log={log} assets={assets} assetsLoading={assetsLoading}
          evidenceLogs={evidenceLogs}
          onScreenshotClick={onScreenshotClick}
        />
      )}
    </div>
  );
}

function ComparisonTab({
  log, assets, copied, onCopyComment,
  activeTableIdx, onTableToggle,
  editingTableIdx, tableEditValues, onStartTableEdit, onUpdateTableEditValue,
  onSaveTableEdits, onCancelTableEdit, isSavingTableEdits, tableEditMsg
}: {
  log: AuditLog; assets: SupplierAssets;
  copied: boolean; onCopyComment: (c: string) => void;
  activeTableIdx: number | null; onTableToggle: (idx: number | null) => void;
  editingTableIdx: number | null; tableEditValues: Record<number, Record<number, string>>;
  onStartTableEdit: (idx: number) => void;
  onUpdateTableEditValue: (tIdx: number, rIdx: number, v: string) => void;
  onSaveTableEdits: (idx: number) => void; onCancelTableEdit: () => void;
  isSavingTableEdits: boolean; tableEditMsg: string | null;
}) {
  const { comment, table, tables } = getCommentAndTable(log.suggested_comment);
  const hasJsonTable = log.comparison_table && Array.isArray(log.comparison_table.tables);

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-[620px] pr-2">
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)]">
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Overall Auditor Verdict</h4>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${log.result.toLowerCase() === "match"
            ? "bg-[var(--match-bg)] text-[var(--match-text)] border border-[var(--match-border)] glow-success"
            : "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)] border border-[var(--mismatch-border)] glow-error"
            }`}>{log.result}</span>
          <span className="text-xs text-[var(--text-secondary)]">
            {log.result.toLowerCase() === "match"
              ? "Audit passed. Documents verify questionnaire values."
              : "Audit failed. One or more fields require revisions."}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] relative">
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Suggested comment</h4>
        <p className="text-sm text-[var(--text-primary)] italic font-medium pr-10 leading-relaxed whitespace-pre-wrap">
          &ldquo;{comment || "No detailed comments provided."}&rdquo;
        </p>
        <button onClick={() => onCopyComment(comment)}
          className="absolute right-4 top-4 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)] transition-all duration-300 cursor-pointer active:scale-95 text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
          title="Copy suggested comment"
        >
          {copied ? <IconCheck className="h-4.5 w-4.5 text-[var(--match-text)]" /> : <IconCopy className="h-4.5 w-4.5" />}
        </button>
      </div>

      {hasJsonTable ? (
        <JsonComparisonTables
          log={log} assets={assets}
          activeTableIdx={activeTableIdx} onTableToggle={onTableToggle}
          editingTableIdx={editingTableIdx} tableEditValues={tableEditValues}
          onStartTableEdit={onStartTableEdit} onUpdateTableEditValue={onUpdateTableEditValue}
          onSaveTableEdits={onSaveTableEdits} onCancelTableEdit={onCancelTableEdit}
          isSavingTableEdits={isSavingTableEdits} tableEditMsg={tableEditMsg}
        />
      ) : (
        <LegacyComparisonTables log={log} table={table} tables={tables} />
      )}
    </div>
  );
}

function JsonComparisonTables({
  log, assets, activeTableIdx, onTableToggle,
  editingTableIdx, tableEditValues, onStartTableEdit, onUpdateTableEditValue,
  onSaveTableEdits, onCancelTableEdit, isSavingTableEdits, tableEditMsg
}: {
  log: AuditLog; assets: SupplierAssets;
  activeTableIdx: number | null; onTableToggle: (idx: number | null) => void;
  editingTableIdx: number | null; tableEditValues: Record<number, Record<number, string>>;
  onStartTableEdit: (idx: number) => void;
  onUpdateTableEditValue: (tIdx: number, rIdx: number, v: string) => void;
  onSaveTableEdits: (idx: number) => void; onCancelTableEdit: () => void;
  isSavingTableEdits: boolean; tableEditMsg: string | null;
}) {
  return (
    <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-6">
      {tableEditMsg && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${tableEditMsg.includes("recalculated")
          ? "bg-[var(--match-bg)] border border-[var(--match-border)] text-[var(--match-text)]"
          : "bg-[var(--mismatch-bg)] border border-[var(--mismatch-border)] text-[var(--mismatch-text)]"
          }`}>
          {tableEditMsg.includes("recalculated") ? <IconCircleCheck className="h-4 w-4 shrink-0" /> : <IconAlertTriangle className="h-4 w-4 shrink-0" />}
          <span>{tableEditMsg}</span>
        </div>
      )}
      <div className="border-b border-[var(--border-subtle)] pb-3">
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Comparison Tables</h4>
        <h3 className="text-sm font-bold text-[var(--heading-color)] tracking-wide">
          Supplier Name: <span className="text-[var(--match-text)]">{log.comparison_table.supplier_name || log.supplier_name}</span>
          {log.comparison_table?.region && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] align-middle">
              {log.comparison_table.region}
            </span>
          )}
        </h3>
      </div>

      {log.comparison_table.tables.map((t: any, tIdx: number) => {
        const isActive = activeTableIdx === tIdx;
        const matchingDoc = t.attached_file
          ? assets.documents.find(doc =>
            doc.name.toLowerCase() === t.attached_file.toLowerCase() ||
            t.attached_file.toLowerCase().includes(doc.name.toLowerCase()) ||
            doc.name.toLowerCase().includes(t.attached_file.toLowerCase())
          ) : null;
        const pdfUrl = matchingDoc ? `http://127.0.0.1:8000/api/files/${btoa(matchingDoc.url).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}` : null;

        return (
          <div key={tIdx}
            onClick={() => onTableToggle(isActive ? null : tIdx)}
            className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${isActive
              ? "bg-[var(--match-bg)] border-[var(--match-border)] shadow-[0_0_15px_rgba(16,185,129,0.04)]"
              : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--match-border)]"
              }`}
          >
            <div className={isActive && pdfUrl ? "grid grid-cols-1 xl:grid-cols-12 gap-6" : "space-y-3"}>
              {isActive && pdfUrl && (
                <div className="xl:col-span-5 h-[400px] border border-[var(--border-subtle)] bg-[var(--bg-input)] rounded-lg overflow-hidden flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] flex justify-between items-center text-[10px] text-[var(--text-secondary)] font-mono">
                    <span className="truncate pr-4">{t.attached_file}</span>
                    <a href={pdfUrl} target="_blank" rel="noreferrer"
                      className="text-[var(--match-text)] hover:underline flex items-center gap-1 hover:text-[var(--match-text)] transition-colors"
                    >Open PDF <IconExternalLink className="h-3 w-3" /></a>
                  </div>
                  <iframe src={`${pdfUrl}#toolbar=0`} className="w-full flex-1 border-0" title="PDF Document Viewer" />
                </div>
              )}

              <div className={isActive && pdfUrl ? "xl:col-span-7 space-y-3" : "space-y-3"}>
                {t.question_label && (
                  <div className="flex flex-row justify-between items-start gap-2 mt-1">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] tracking-wide">{t.question_label}</h4>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {editingTableIdx === tIdx ? (
                        <>
                          <button onClick={() => onSaveTableEdits(tIdx)} disabled={isSavingTableEdits}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[var(--heading-color)] text-[10px] font-semibold tracking-wide transition-all cursor-pointer active:scale-95 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isSavingTableEdits ? <IconLoader2 className="h-3 w-3 animate-spin" /> : <IconCheck className="h-3.5 w-3.5" />}
                            Save
                          </button>
                          <button onClick={onCancelTableEdit}
                            className="px-2.5 py-1 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] text-[10px] font-semibold tracking-wide transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                          ><IconX className="h-3.5 w-3.5" /> Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => onStartTableEdit(tIdx)}
                          className="p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--match-text)] transition-all cursor-pointer active:scale-90"
                          title="Edit all values in evidence"
                        ><IconEdit className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </div>
                )}
                <TableGrid
                  rows={t.comparison_rows}
                  editing={editingTableIdx === tIdx}
                  editValues={tableEditValues[tIdx] || {}}
                  onUpdateValue={(rIdx, v) => onUpdateTableEditValue(tIdx, rIdx, v)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableGrid({
  rows, editing, editValues, onUpdateValue
}: {
  rows: any[];
  editing: boolean;
  editValues: Record<number, string>;
  onUpdateValue: (rIdx: number, v: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
      onClick={(e) => e.stopPropagation()}>
      <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '35%' }} />
          <col style={{ width: '35%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-[var(--match-border)] font-bold text-[var(--match-text)] bg-[var(--table-header-bg)] backdrop-blur-sm">
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Field</th>
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Value in Evidence</th>
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px] border-r border-[var(--border-visible)]">Value in Ariba</th>
            <th className="py-2.5 px-3 uppercase tracking-wider text-[10px]">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, rIdx: number) => {
            const isMatch = row.result.toLowerCase() === "match";
            const isMismatch = row.result.toLowerCase() === "mismatch";
            return (
              <tr key={rIdx} className="hover:bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)] whitespace-normal break-words align-top">{row.field_name}</td>
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)] whitespace-normal break-words align-top">
                  {editing ? (
                    <textarea value={editValues[rIdx] ?? row.value_evidence}
                      onChange={(e) => onUpdateValue(rIdx, e.target.value)}
                      className="w-full bg-transparent border border-[var(--match-border)] rounded px-1.5 py-1 text-xs font-sans text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--match-border)] transition-colors" rows={2}
                    />
                  ) : (
                    <div className="whitespace-normal break-words">{row.value_evidence}</div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)] whitespace-normal break-words align-top">{row.value_in_ariba}</td>
                <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium whitespace-normal break-words align-top">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isMatch ? "bg-[var(--match-bg)] text-[var(--match-text)]" : isMismatch ? "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)]" : "bg-amber-500/10 text-amber-400"}`}>
                    {row.result}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LegacyComparisonTables({ log, table, tables }: {
  log: AuditLog;
  table: { headers: string[]; rows: string[][] } | null;
  tables: ComparisonTable[];
}) {
  return (
    <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-6">
      <div className="border-b border-[var(--border-subtle)] pb-3">
        <h3 className="text-sm font-bold text-[var(--heading-color)] tracking-wide">
          Supplier Name: <span className="text-[var(--match-text)]">{log.supplier_name}</span>
        </h3>
      </div>
      {table && (
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--match-border)] transition-all duration-300 space-y-3 cursor-pointer">
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--match-border)] font-bold text-[var(--match-text)] bg-[var(--table-header-bg)] backdrop-blur-sm">
                  {table.headers.map((h, i) => (
                    <th key={i} className={`py-2.5 px-3 uppercase tracking-wider text-[10px] ${i < table.headers.length - 1 ? 'border-r border-[var(--border-visible)]' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                    {row.map((cell, cIdx) => {
                      const isStatusCell = cIdx === row.length - 1;
                      const cleanCell = cell.trim();
                      const isMatch = cleanCell.toLowerCase() === "match";
                      const isMismatch = cleanCell.toLowerCase() === "mismatch";
                      return (
                        <td key={cIdx} className={`py-2.5 px-3 text-[var(--text-primary)] font-medium whitespace-normal break-words align-top ${cIdx < row.length - 1 ? 'border-r border-[var(--border-subtle)]' : ''}`}>
                          {isStatusCell ? (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isMatch ? "bg-[var(--match-bg)] text-[var(--match-text)]" : isMismatch ? "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)]" : "bg-amber-500/10 text-amber-400"}`}>
                              {cleanCell}
                            </span>
                          ) : cleanCell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tables.map((t, tIdx) => (
        <div key={tIdx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--match-border)] transition-all duration-300 space-y-3 cursor-pointer">
          {t.label && <h4 className="text-xs font-bold text-[var(--text-primary)] tracking-wide mt-2">{t.label}</h4>}
          <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '35%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--match-border)] font-bold text-[var(--match-text)] bg-[var(--table-header-bg)] backdrop-blur-sm">
                  {t.headers.map((h, i) => (
                    <th key={i} className={`py-2.5 px-3 uppercase tracking-wider text-[10px] ${i < t.headers.length - 1 ? 'border-r border-[var(--border-visible)]' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
                    {row.map((cell, cIdx) => {
                      const isStatusCell = cIdx === row.length - 1;
                      const cleanCell = cell.trim();
                      const isMatch = cleanCell.toLowerCase() === "match";
                      const isMismatch = cleanCell.toLowerCase() === "mismatch";
                      return (
                        <td key={cIdx} className={`py-2.5 px-3 text-[var(--text-primary)] font-medium whitespace-normal break-words align-top ${cIdx < row.length - 1 ? 'border-r border-[var(--border-subtle)]' : ''}`}>
                          {isStatusCell ? (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isMatch ? "bg-[var(--match-bg)] text-[var(--match-text)]" : isMismatch ? "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)]" : "bg-amber-500/10 text-amber-400"}`}>
                              {cleanCell}
                            </span>
                          ) : cleanCell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceTab({ log, assets, assetsLoading, evidenceLogs, onScreenshotClick }: {
  log: AuditLog;
  assets: SupplierAssets;
  assetsLoading: boolean;
  evidenceLogs: DocumentEvidence[];
  onScreenshotClick: (url: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-[620px] pr-2">
      <div className="space-y-6">
        {(() => {
          const matchingEvidence = evidenceLogs.filter(e =>
            e.supplier_name.toLowerCase() === (log.supplier_name || log.comparison_table?.supplier_name || "").toLowerCase()
          );
          const visibleDocs = assets.documents.filter(doc => doc.name.toLowerCase() !== "qa_data.json");
          const parsedQA = matchingEvidence.map(e => {
            let answers = [];
            try { answers = JSON.parse(e.ariba_qa_answers || "[]"); } catch { }
            return { questionLabel: e.ariba_question_label, filename: e.filename, answers, original_evidence: e };
          });
          parsedQA.sort((a, b) => {
            const keyA = getLabelSortKey(a.questionLabel);
            const keyB = getLabelSortKey(b.questionLabel);
            for (let i = 0; i < Math.max(keyA.length, keyB.length); i++) {
              const valA = keyA[i] ?? 0;
              const valB = keyB[i] ?? 0;
              if (valA !== valB) return valA - valB;
            }
            return 0;
          });
          if (parsedQA.length === 0) return <p className="text-sm text-[var(--text-tertiary)] italic">No evidence records found.</p>;

          return parsedQA.map((item: any, idx: number) => {
            const ev = item.original_evidence;
            const matchingDoc = visibleDocs.find(d =>
              d.name.toLowerCase() === ev.filename.toLowerCase() ||
              ev.filename.toLowerCase().includes(d.name.toLowerCase()) ||
              d.name.toLowerCase().includes(ev.filename.toLowerCase())
            );
            let geminiData = null;
            try { geminiData = JSON.parse(ev.gemini_extracted_metadata || "{}"); } catch { }

            return (
              <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                  <h4 className="text-xs font-bold text-[var(--heading-color)] truncate max-w-full sm:max-w-[450px]">{cleanQuestionLabel(ev.ariba_question_label)}</h4>
                  <span className="text-[9px] uppercase font-bold text-[var(--match-text)] tracking-wider px-2 py-0.5 rounded bg-[var(--match-bg)] border border-[var(--match-border)] shrink-0">{ev.filename}</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-6 space-y-2.5">
                    <h5 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Questionnaire Answers</h5>
                    {item.answers.length === 0 ? (
                      <p className="text-xs text-[var(--text-tertiary)] italic">No Q&A Answers available.</p>
                    ) : (
                      <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                        {item.answers.map((ans: any, aIdx: number) => (
                          <div key={aIdx} className="text-xs flex gap-2">
                            <span className="text-[var(--text-tertiary)] font-medium shrink-0">{ans.label}:</span>
                            <span className="text-[var(--text-primary)] font-medium">{ans.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-6 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <h5 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Extracted Metadata</h5>
                      {matchingDoc && (
                        <a href={`http://127.0.0.1:8000${matchingDoc.url}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-[9px] text-[var(--match-text)] hover:underline hover:text-[var(--match-text)] transition-colors"
                        >Open PDF <IconArrowUpRight className="h-3 w-3" /></a>
                      )}
                    </div>
                    {geminiData && Object.keys(geminiData).length > 0 ? (
                      <div className="p-2.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[11px] space-y-1.5 font-mono text-[var(--text-secondary)]">
                        <div className="flex justify-between gap-2"><span>Extracted Supplier:</span><span className="text-[var(--heading-color)] truncate max-w-[140px] font-sans">{geminiData.certificateOwnerName || 'N/A'}</span></div>
                        <div className="flex justify-between gap-2"><span>Issuer Name:</span><span className="text-[var(--heading-color)] truncate max-w-[140px] font-sans">{geminiData.issuerName || 'N/A'}</span></div>
                        <div className="flex justify-between gap-2"><span>Cert Type:</span><span className="text-[var(--heading-color)] truncate max-w-[140px] font-sans">{geminiData.certificateType || 'N/A'}</span></div>
                        <div className="flex justify-between"><span>Cert Number:</span><span className="text-[var(--heading-color)]">{geminiData.certificateNumber || 'N/A'}</span></div>
                        <div className="flex justify-between gap-2"><span>Location:</span><span className="text-[var(--heading-color)] truncate max-w-[150px] font-sans">{geminiData.certificateLocation || 'N/A'}</span></div>
                        <div className="flex justify-between"><span>Effective Date:</span><span className="text-[var(--heading-color)]">{geminiData.effectiveDate || 'N/A'}</span></div>
                        <div className="flex justify-between"><span>Expiration Date:</span><span className="text-[var(--heading-color)]">{geminiData.expirationDate || 'N/A'}</span></div>
                        <div className="flex justify-between"><span>Publication Year:</span><span className="text-[var(--heading-color)]">{geminiData.yearOfPublication || 'N/A'}</span></div>
                      </div>
                    ) : <p className="text-xs text-[var(--text-tertiary)] italic">No extracted metadata available.</p>}
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {assets.screenshots.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-6 mt-6">
          <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <IconPhoto className="h-4.5 w-4.5 text-[var(--match-text)]" />
            Audit Validation Screen Captures ({assets.screenshots.length})
          </h4>
          {assetsLoading ? (
            <div className="h-16 bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded-xl animate-pulse" />
          ) : (
            <div className="flex flex-wrap gap-3">
              {assets.screenshots.map((shot, idx) => {
                const fullShotUrl = shot.startsWith("http") ? shot : `http://127.0.0.1:8000${shot}`;
                return (
                  <div key={idx} onClick={() => onScreenshotClick(fullShotUrl)}
                    className="w-[10%] min-w-[80px] aspect-video border border-[var(--border-subtle)] rounded overflow-hidden relative group cursor-zoom-in bg-[var(--bg-input)]"
                    title="Expand capture"
                  >
                    <img src={fullShotUrl} alt="Audit verification capture"
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                    />
                    <div className="absolute inset-0 bg-[var(--bg-surface)] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                      <IconExternalLink className="h-3 w-3 text-[var(--heading-color)]" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
