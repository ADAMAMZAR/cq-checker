"use client";

import { IconFileCheck, IconChevronRight } from "@tabler/icons-react";
import type { AuditVerdictCardProps } from "../types";

export default function AuditVerdictCard({
  auditResult,
  selectedSupplier,
  running,
  onNavigateToRegistry,
}: AuditVerdictCardProps) {
  if (!auditResult || !selectedSupplier || running) return null;

  const isMatch = auditResult.audit_result === "Match";

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl animate-fade-in">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl ${isMatch
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
          >
            <IconFileCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-[var(--heading-color)]">
              Audit Verification Completed
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">
              Audit ID: {auditResult.audit_id || "N/A"}
            </p>
          </div>
        </div>

        <div
          className={`px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide border ${isMatch
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
            }`}
        >
          {isMatch ? "PASS / MATCH" : "MISMATCH DETECTED"}
        </div>
      </div>

      {/* Suggested Comment / Discrepancies */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Audit Verdict &amp; Suggested Comment:
        </p>
        <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--heading-color)] whitespace-pre-wrap leading-relaxed">
          {auditResult.suggested_comment || "All certificate requirements matched successfully."}
        </div>
      </div>

      {/* Registry Navigation Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => onNavigateToRegistry?.(selectedSupplier.supplier_name)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-sm transition-all shadow-md active:scale-[0.98] cursor-pointer"
        >
          View Record in Audit Registry
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
