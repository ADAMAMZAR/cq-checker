"use client";

import { useState } from "react";
import { IconFolderPlus, IconX, IconLoader2 } from "@tabler/icons-react";
import type { CreateFolderModalProps } from "../types";

export default function CreateFolderModal({ onClose, onConfirm }: CreateFolderModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(name.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)]">
              <IconFolderPlus className="w-4 h-4" />
            </div>
            <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">Create New Folder</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <p className="text-xs font-medium text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">
            ⚠️ {error}
          </p>
        )}

        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="e.g. Safety Manuals, QA Checklists"
          className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary-border)] shadow-xs"
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            className="px-4 py-1.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-xs font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {submitting ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : "Create Folder"}
          </button>
        </div>
      </div>
    </div>
  );
}
