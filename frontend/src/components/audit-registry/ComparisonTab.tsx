"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { getCommentAndTable, formatSuggestedComment } from "@/lib/utils";
import type { ComparisonTabProps } from "./types";
import JsonComparisonTables from "./JsonComparisonTables";
import LegacyComparisonTables from "./LegacyComparisonTables";

export default function ComparisonTab({
  log,
  assets,
  copied,
  onCopyComment,
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
}: ComparisonTabProps) {
  const { comment, table, tables } = getCommentAndTable(log.suggested_comment);
  const hasJsonTable = Boolean(log.comparison_table && Array.isArray(log.comparison_table.tables));
  const fullFormattedComment = formatSuggestedComment(comment);

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-none lg:max-h-[620px] pr-2">
      {/* Overall Verdict Badge */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)]">
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
          Overall Auditor Verdict
        </h4>
        <div className="flex items-center gap-2">
          <span
            key={`verdict-${log.audit_id}`}
            className={`pop-in px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              log.result.toLowerCase() === "match"
                ? "bg-[var(--match-bg)] text-[var(--match-text)] border border-[var(--match-border)] glow-success"
                : "bg-[var(--mismatch-bg)] text-[var(--mismatch-text)] border border-[var(--mismatch-border)] glow-error"
            }`}
          >
            {log.result}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {log.result.toLowerCase() === "match"
              ? "Audit passed. Documents verify questionnaire values."
              : "Audit failed. One or more fields require revisions."}
          </span>
        </div>
      </div>

      {/* Suggested Comment Box */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] relative">
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
          Suggested comment
        </h4>
        <p className="text-sm text-[var(--text-primary)] italic font-medium pr-10 leading-relaxed whitespace-pre-wrap">
          &ldquo;{fullFormattedComment || "No detailed comments provided."}&rdquo;
        </p>
        <button
          onClick={() => onCopyComment(comment)}
          className="icon-action absolute right-4 top-4 p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)] transition-all duration-300 cursor-pointer active:scale-95 text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
          title="Copy suggested comment"
          aria-label="Copy suggested comment"
        >
          {copied ? (
            <IconCheck className="h-4.5 w-4.5 text-[var(--match-text)]" />
          ) : (
            <IconCopy className="h-4.5 w-4.5" />
          )}
        </button>
      </div>

      {/* Tables View */}
      {hasJsonTable ? (
        <JsonComparisonTables
          log={log}
          assets={assets}
          activeTableIdx={activeTableIdx}
          onTableToggle={onTableToggle}
          editingTableIdx={editingTableIdx}
          tableEditValues={tableEditValues}
          onStartTableEdit={onStartTableEdit}
          onUpdateTableEditValue={onUpdateTableEditValue}
          onSaveTableEdits={onSaveTableEdits}
          onCancelTableEdit={onCancelTableEdit}
          isSavingTableEdits={isSavingTableEdits}
          tableEditMsg={tableEditMsg}
        />
      ) : (
        <LegacyComparisonTables log={log} table={table} tables={tables} />
      )}
    </div>
  );
}
