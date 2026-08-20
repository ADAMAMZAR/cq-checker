"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

interface RecipientSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  recipientEmail: string;
  setRecipientEmail: (v: string) => void;
}

export default function RecipientSection({
  isOpen,
  onToggle,
  recipientEmail,
  setRecipientEmail,
}: RecipientSectionProps) {
  return (
    <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">
            4
          </span>
          <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
            Recipient Detail
          </h2>
        </div>
        <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
          <span>{isOpen ? "Collapse" : "Expand"}</span>
          {isOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 space-y-4 animate-fade-in">
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
              Recipient Distribution Email Address <span className="text-[var(--mismatch-text)]">*</span>
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="e.g. vendor.desk@gamuda.com.my"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
            />
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
              The finalized official document will be sent to this email address.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
