"use client";

import { useEffect } from "react";
import { IconX } from "@tabler/icons-react";
import type { CellModalProps } from "../types";

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

export default function CellModal({ column, rowNumber, value, onClose }: CellModalProps) {
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
            <h3 className="font-sans text-sm font-bold text-[var(--heading-color)] truncate">
              {column}
            </h3>
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
