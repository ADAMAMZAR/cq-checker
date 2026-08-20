"use client";

import { IconCheck, IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import type { StatusMessage } from "../types";

export default function StatusBanner({ statusMessage }: { statusMessage: StatusMessage }) {
  return (
    <div
      className={`p-4 rounded-xl mb-6 border text-xs sm:text-sm flex flex-col gap-2 shadow-lg transition-all animate-fade-in ${
        statusMessage.type === "success"
          ? "bg-[var(--match-bg)] border-[var(--match-border)] text-[var(--match-text)]"
          : statusMessage.type === "error"
          ? "bg-[var(--mismatch-bg)] border-[var(--accent-danger-border)] text-[var(--mismatch-text)]"
          : "bg-[var(--bg-surface)] border-[var(--border-visible)] text-[var(--text-primary)]"
      }`}
    >
      <div className="flex items-center gap-2.5 font-semibold">
        {statusMessage.type === "success" ? (
          <IconCheck className="w-5 h-5 shrink-0" />
        ) : statusMessage.type === "error" ? (
          <IconAlertTriangle className="w-5 h-5 shrink-0" />
        ) : (
          <IconLoader2 className="w-5 h-5 animate-spin shrink-0 text-[var(--accent-primary-text)]" />
        )}
        <span>{statusMessage.text}</span>
      </div>

      {statusMessage.payloadPreview && (
        <div className="mt-3 p-3 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-[11px] space-y-2 overflow-x-auto text-[var(--text-primary)]">
          <div className="font-bold text-[var(--heading-color)] font-sans border-b border-[var(--border-subtle)] pb-1 flex justify-between items-center">
            <span>Compiled Event Payload JSON</span>
            <span className="text-[10px] text-[var(--accent-success)] uppercase tracking-wider font-mono">
              Status: Ready
            </span>
          </div>
          <pre className="text-[10px] leading-relaxed max-h-60 overflow-y-auto">
            {JSON.stringify(statusMessage.payloadPreview, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
