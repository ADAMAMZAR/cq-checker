"use client";

import {
  IconCheck,
  IconX,
  IconEdit,
  IconExternalLink,
  IconLoader2,
  IconCircleCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";
import type { AuditRegistryDetail, SupplierAssets } from "@/types";
import { buildFileUrl } from "@/lib/api";
import TableGrid from "./TableGrid";

interface JsonComparisonTablesProps {
  log: AuditRegistryDetail;
  assets: SupplierAssets;
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
}

export default function JsonComparisonTables({
  log,
  assets,
  activeTableIdx,
  onTableToggle,
  editingTableIdx,
  tableEditValues,
  onStartTableEdit,
  onUpdateTableEditValue,
  onSaveTableEdits,
  onCancelTableEdit,
  isSavingTableEdits,
  tableEditMsg,
}: JsonComparisonTablesProps) {
  return (
    <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-6">
      {/* Toast Notification Message */}
      {tableEditMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            tableEditMsg.includes("recalculated")
              ? "bg-[var(--match-bg)] border border-[var(--match-border)] text-[var(--match-text)]"
              : "bg-[var(--mismatch-bg)] border border-[var(--mismatch-border)] text-[var(--mismatch-text)]"
          }`}
        >
          {tableEditMsg.includes("recalculated") ? (
            <IconCircleCheck className="h-4 w-4 shrink-0" />
          ) : (
            <IconAlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{tableEditMsg}</span>
        </div>
      )}

      {/* Header Info */}
      <div className="border-b border-[var(--border-subtle)] pb-3">
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Comparison Tables
        </h4>
        <h3 className="text-sm font-bold text-[var(--heading-color)] tracking-wide">
          Supplier Name:{" "}
          <span className="text-[var(--match-text)]">
            {log.comparison_table?.supplier_name || log.supplier_name}
          </span>
          {log.comparison_table?.region && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] align-middle">
              {log.comparison_table.region}
            </span>
          )}
        </h3>
      </div>

      {/* List of Tables */}
      {log.comparison_table?.tables?.map((t: any, tIdx: number) => {
        const isActive = activeTableIdx === tIdx;
        const matchingDoc = t.attached_file
          ? assets.documents.find(
              (doc) =>
                doc.name.toLowerCase() === t.attached_file.toLowerCase() ||
                t.attached_file.toLowerCase().includes(doc.name.toLowerCase()) ||
                doc.name.toLowerCase().includes(t.attached_file.toLowerCase())
            )
          : null;
        const pdfUrl = matchingDoc ? buildFileUrl(matchingDoc.url) : null;

        return (
          <button
            key={tIdx}
            type="button"
            aria-expanded={isActive}
            onClick={() => onTableToggle(isActive ? null : tIdx)}
            className={`w-full text-left p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
              isActive
                ? "bg-[var(--match-bg)] border-[var(--match-border)] shadow-[0_0_15px_rgba(16,185,129,0.04)]"
                : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--match-border)]"
            }`}
          >
            <div className={isActive && pdfUrl ? "grid grid-cols-1 xl:grid-cols-12 gap-6" : "space-y-3"}>
              {/* PDF Preview Iframe Side-Pane */}
              {isActive && pdfUrl && (
                <div
                  className="xl:col-span-5 h-[400px] border border-[var(--border-subtle)] bg-[var(--bg-input)] rounded-lg overflow-hidden flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] flex justify-between items-center text-[10px] text-[var(--text-secondary)] font-mono">
                    <span className="truncate pr-4">{t.attached_file}</span>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--match-text)] hover:underline flex items-center gap-1 transition-colors"
                    >
                      Open PDF <IconExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <iframe src={`${pdfUrl}#toolbar=0`} className="w-full flex-1 border-0" title="PDF Document Viewer" />
                </div>
              )}

              {/* Table Data Pane */}
              <div className={isActive && pdfUrl ? "xl:col-span-7 space-y-3" : "space-y-3"}>
                {t.question_label && (
                  <div className="flex flex-row justify-between items-start gap-2 mt-1">
                    <h4 className="text-xs font-bold text-[var(--text-primary)] tracking-wide">
                      {t.question_label} - ({t.attached_file})
                    </h4>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {editingTableIdx === tIdx ? (
                        <>
                          <button
                            onClick={() => onSaveTableEdits(tIdx)}
                            disabled={isSavingTableEdits}
                            className="icon-action px-2.5 py-1 rounded-lg bg-[var(--accent-success-strong)] hover:bg-[var(--accent-success)] text-[var(--heading-color)] text-[10px] font-semibold tracking-wide transition-all cursor-pointer active:scale-95 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isSavingTableEdits ? (
                              <IconLoader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <IconCheck className="h-3.5 w-3.5" />
                            )}
                            Save
                          </button>
                          <button
                            onClick={onCancelTableEdit}
                            className="icon-action px-2.5 py-1 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] text-[10px] font-semibold tracking-wide transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                          >
                            <IconX className="h-3.5 w-3.5" /> Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onStartTableEdit(tIdx)}
                          className="icon-action p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--match-text)] transition-all cursor-pointer active:scale-90"
                          title="Edit all values in evidence"
                          aria-label="Edit all values in evidence"
                        >
                          <IconEdit className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <TableGrid
                  rows={t.comparison_rows || []}
                  editing={editingTableIdx === tIdx}
                  editValues={tableEditValues[tIdx] || {}}
                  onUpdateValue={(rIdx, v) => onUpdateTableEditValue(tIdx, rIdx, v)}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
