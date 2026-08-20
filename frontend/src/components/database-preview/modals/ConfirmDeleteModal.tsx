"use client";

import { IconTrash, IconX } from "@tabler/icons-react";
import type { ConfirmDeleteModalProps } from "../types";

export default function ConfirmDeleteModal({
  confirmDeleteState,
  deletingRow,
  onClose,
  onExecuteDelete,
}: ConfirmDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[var(--bg-card)] p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2 text-rose-400">
            <IconTrash className="w-4 h-4" />
            <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">
              Confirm Row Deletion
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)]"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)]">
          Are you sure you want to delete this row from{" "}
          <span className="font-bold text-[var(--heading-color)]">
            {confirmDeleteState.tableName}
          </span>
          ?
        </p>

        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-1 text-[var(--text-primary)]">
          {Object.entries(confirmDeleteState.pk).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-[var(--text-tertiary)]">{k}:</span>
              <span className="font-semibold text-amber-400 truncate">{v}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onExecuteDelete}
            disabled={deletingRow !== null}
            className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            {deletingRow !== null ? "Deleting..." : "Delete Row"}
          </button>
        </div>
      </div>
    </div>
  );
}
