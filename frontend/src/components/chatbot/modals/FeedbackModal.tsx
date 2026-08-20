"use client";

import { useState } from "react";
import { IconThumbDown, IconX, IconLoader2 } from "@tabler/icons-react";
import type { FeedbackModalProps } from "../types";

const FEEDBACK_REASONS = [
  "Incorrect information",
  "Incomplete answer",
  "Off-topic response",
  "Too verbose",
  "Other",
] as const;

export default function FeedbackModal({ messageId, onClose, onSubmit }: FeedbackModalProps) {
  const [reason, setReason] = useState<string>("");
  const [customText, setCustomText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const finalReason = reason === "Other" && customText.trim() ? customText.trim() : reason;
      await onSubmit(messageId, "not_satisfied", finalReason || undefined);
      onClose();
    } catch (err: unknown) {
      console.error("Feedback submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <IconThumbDown className="w-4 h-4" />
            </div>
            <h3 className="font-sans text-sm font-bold text-[var(--heading-color)]">
              Improve Assistant Responses
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          What was wrong with this response? Select a reason to help us calibrate the AI model:
        </p>

        <div className="space-y-1.5">
          {FEEDBACK_REASONS.map((r) => (
            <label
              key={r}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition-all ${
                reason === r
                  ? "bg-[var(--accent-primary-soft)] border-[var(--accent-primary-border)] text-[var(--accent-primary-text)] font-semibold"
                  : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
              }`}
            >
              <input
                type="radio"
                name="feedback_reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-[var(--accent-primary)] cursor-pointer"
              />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {reason === "Other" && (
          <textarea
            rows={2}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Describe the issue in detail…"
            className="w-full p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary-border)] resize-none"
          />
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-1.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-xs font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting ? <IconLoader2 className="w-3.5 h-3.5 animate-spin" /> : "Submit Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
