"use client";

import { IconChevronDown, IconChevronRight, IconUser, IconArrowRight } from "@tabler/icons-react";

interface ContactsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  onNext: () => void;
  primaryContactName: string;
  setPrimaryContactName: (v: string) => void;
  primaryContactCode: string;
  setPrimaryContactCode: (v: string) => void;
  primaryContactPhone: string;
  setPrimaryContactPhone: (v: string) => void;
  primaryContactEmail: string;
  setPrimaryContactEmail: (v: string) => void;
  secondaryContactName: string;
  setSecondaryContactName: (v: string) => void;
  secondaryContactCode: string;
  setSecondaryContactCode: (v: string) => void;
  secondaryContactPhone: string;
  setSecondaryContactPhone: (v: string) => void;
  secondaryContactEmail: string;
  setSecondaryContactEmail: (v: string) => void;
}

export default function ContactsSection({
  isOpen,
  onToggle,
  onNext,
  primaryContactName,
  setPrimaryContactName,
  primaryContactCode,
  setPrimaryContactCode,
  primaryContactPhone,
  setPrimaryContactPhone,
  primaryContactEmail,
  setPrimaryContactEmail,
  secondaryContactName,
  setSecondaryContactName,
  secondaryContactCode,
  setSecondaryContactCode,
  secondaryContactPhone,
  setSecondaryContactPhone,
  secondaryContactEmail,
  setSecondaryContactEmail,
}: ContactsSectionProps) {
  return (
    <div className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-6 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-bold text-xs flex items-center justify-center border border-[var(--accent-primary-border)]">
            3
          </span>
          <h2 className="text-base font-bold text-[var(--heading-color)] tracking-wide uppercase">
            Contact Information
          </h2>
        </div>
        <div className="text-[var(--text-tertiary)] flex items-center gap-2 text-xs font-semibold">
          <span>{isOpen ? "Collapse" : "Expand"}</span>
          {isOpen ? <IconChevronDown className="w-4 h-4" /> : <IconChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 space-y-6 animate-fade-in">
          {/* Primary Contact */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-[var(--heading-color)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2 flex items-center gap-2">
              <IconUser className="w-4 h-4 text-[var(--accent-primary-text)]" />
              <span>Primary Contact (Contact 1)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Name <span className="text-[var(--mismatch-text)]">*</span>
                </label>
                <input
                  type="text"
                  value={primaryContactName}
                  onChange={(e) => setPrimaryContactName(e.target.value)}
                  placeholder="e.g. Ahmad Razak"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Phone <span className="text-[var(--mismatch-text)]">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={primaryContactCode}
                    onChange={(e) => setPrimaryContactCode(e.target.value)}
                    placeholder="+60"
                    required
                    className="w-24 px-2.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-center font-mono font-semibold text-[var(--text-primary)]"
                  />
                  <input
                    type="text"
                    value={primaryContactPhone}
                    onChange={(e) => setPrimaryContactPhone(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="112223333"
                    required
                    className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Email <span className="text-[var(--mismatch-text)]">*</span>
                </label>
                <input
                  type="email"
                  value={primaryContactEmail}
                  onChange={(e) => setPrimaryContactEmail(e.target.value)}
                  placeholder="ahmad.razak@gamuda.com.my"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Secondary Contact */}
          <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-bold text-[var(--heading-color)] uppercase tracking-wider border-b border-[var(--border-subtle)] pb-2 flex items-center gap-2">
              <IconUser className="w-4 h-4 text-[var(--text-tertiary)]" />
              <span>Secondary Contact (Contact 2)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Name <span className="text-[var(--mismatch-text)]">*</span>
                </label>
                <input
                  type="text"
                  value={secondaryContactName}
                  onChange={(e) => setSecondaryContactName(e.target.value)}
                  placeholder="e.g. Sarah Lee"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Phone <span className="text-[var(--mismatch-text)]">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={secondaryContactCode}
                    onChange={(e) => setSecondaryContactCode(e.target.value)}
                    placeholder="+60"
                    required
                    className="w-24 px-2.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-center font-mono font-semibold text-[var(--text-primary)]"
                  />
                  <input
                    type="text"
                    value={secondaryContactPhone}
                    onChange={(e) => setSecondaryContactPhone(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="123456789"
                    required
                    className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
                  Email <span className="text-[var(--mismatch-text)]">*</span>
                </label>
                <input
                  type="email"
                  value={secondaryContactEmail}
                  onChange={(e) => setSecondaryContactEmail(e.target.value)}
                  placeholder="sarah.lee@gamuda.com.my"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>

          {/* Next Section Step Button */}
          <div className="flex justify-end pt-4 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onNext}
              className="px-5 py-2 rounded-xl bg-[var(--accent-primary-soft)] hover:bg-[var(--accent-primary-soft-strong)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Next: Recipient Detail</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
