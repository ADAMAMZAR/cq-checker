"use client";

import { IconLoader2, IconCheck } from "@tabler/icons-react";
import type { AuditPipelineProgressProps } from "../types";
import { STAGES } from "../types";

export default function AuditPipelineProgress({
  running,
  selectedSupplier,
  stage,
}: AuditPipelineProgressProps) {
  if (!running || !selectedSupplier) return null;

  const isStageActive = (i: number) => i === stage;
  const isStageDone = (i: number) => i < stage;

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <IconLoader2 className="h-5 w-5 animate-spin text-[var(--accent-success-text)]" />
        <div>
          <p className="text-sm font-bold text-[var(--heading-color)]">Running Supplier Audit</p>
          <p className="text-xs text-[var(--text-tertiary)] truncate">
            Supplier: {selectedSupplier.supplier_name}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {STAGES.map((label, i) => {
          const active = isStageActive(i);
          const done = isStageDone(i);
          return (
            <div
              key={label}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
                active
                  ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)]"
                  : done
                  ? "border-[var(--border-subtle)] bg-[var(--bg-input)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-input)] opacity-60"
              }`}
            >
              {done ? (
                <IconCheck className="h-4 w-4 text-[var(--match-text)]" />
              ) : active ? (
                <IconLoader2 className="h-4 w-4 animate-spin text-[var(--accent-success-text)]" />
              ) : (
                <span className="h-4 w-4 rounded-full border-2 border-[var(--border-subtle)]" />
              )}
              <span
                className={`text-sm font-semibold ${
                  active
                    ? "text-[var(--heading-color)]"
                    : done
                    ? "text-[var(--match-text)]"
                    : "text-[var(--text-tertiary)]"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
