"use client";

import { IconChevronLeft } from "@tabler/icons-react";
import type { DetailPaneProps } from "./types";
import ComparisonTab from "./ComparisonTab";
import EvidenceTab from "./EvidenceTab";

export default function DetailPane({
  log,
  assets,
  assetsLoading,
  isEvidenceLoading,
  evidenceLogs,
  activeTab,
  onTabChange,
  onBack,
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
  onScreenshotClick,
}: DetailPaneProps) {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header with Back Button */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-[var(--border-subtle)] gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--heading-color)] transition-all cursor-pointer active:scale-95 shrink-0"
          >
            <IconChevronLeft className="h-4 w-4" />
            Back to List
          </button>
          <h2 className="text-xl font-bold text-[var(--heading-color)] tracking-tight">
            {log.supplier_name}
          </h2>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex gap-4 mb-6 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => onTabChange("comparison")}
          className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${
            activeTab === "comparison"
              ? "border-[var(--accent-success)] text-[var(--heading-color)] font-bold"
              : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}
        >
          Audit Results
        </button>
        <button
          onClick={() => onTabChange("assets")}
          className={`pb-2.5 px-0.5 text-xs font-semibold tracking-wider uppercase border-b-2 transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] ${
            activeTab === "assets"
              ? "border-[var(--accent-success)] text-[var(--heading-color)] font-bold"
              : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}
        >
          Evidence
        </button>
      </div>

      {/* Active Tab Component */}
      {activeTab === "comparison" ? (
        <ComparisonTab
          log={log}
          assets={assets}
          copied={copied}
          onCopyComment={onCopyComment}
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
        <EvidenceTab
          log={log}
          assets={assets}
          assetsLoading={assetsLoading}
          isEvidenceLoading={isEvidenceLoading}
          evidenceLogs={evidenceLogs}
          onScreenshotClick={onScreenshotClick}
        />
      )}
    </div>
  );
}
