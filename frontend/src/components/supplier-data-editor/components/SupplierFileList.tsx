"use client";

import { IconChevronLeft, IconFiles } from "@tabler/icons-react";
import { cleanQuestionLabel } from "@/lib/utils";
import type { SupplierFileListProps } from "../types";

export default function SupplierFileList({
  supplier,
  summaries,
  isLoading,
  onSelectFile,
  onBack,
}: SupplierFileListProps) {
  return (
    <>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border-subtle)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer active:scale-95 shrink-0"
        >
          <IconChevronLeft className="h-4 w-4" />
          Back to Suppliers
        </button>
      </div>
      <div className="flex-1 flex flex-col">
        <h3 className="text-sm font-bold text-[var(--heading-color)] mb-1 truncate">
          Supplier: <span className="text-[var(--match-text)]">{supplier.supplier_name}</span>
        </h3>
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 mt-2 flex items-center gap-1.5">
          <IconFiles className="h-4 w-4 text-[var(--match-text)]" />
          Available Certificates ({summaries.length})
        </h4>
        <div className="flex-1 overflow-y-auto space-y-3 max-h-none lg:max-h-[420px] pr-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse space-y-2"
              >
                <div className="h-3.5 w-3/4 bg-[var(--bg-surface-hover)] rounded" />
                <div className="h-2.5 w-1/2 bg-[var(--bg-surface-hover)] rounded" />
              </div>
            ))
          ) : summaries.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] italic">
              No certificates recorded for this supplier.
            </p>
          ) : (
            summaries.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectFile(s)}
                className="w-full text-left p-4 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] hover:border-[var(--accent-success)] hover:bg-[var(--accent-success-soft)] transition-all duration-300 cursor-pointer"
              >
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs font-semibold text-[var(--heading-color)] truncate pr-2">
                    {s.filename}
                  </p>
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-medium truncate">
                  {cleanQuestionLabel(s.ariba_question_label)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
