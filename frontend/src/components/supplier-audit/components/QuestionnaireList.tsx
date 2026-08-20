"use client";

import {
  IconFileDescription,
  IconLoader2,
  IconFileCheck,
  IconChevronRight,
} from "@tabler/icons-react";
import type { QuestionnaireListProps } from "../types";

function ChevronBadge({ isSelected }: { isSelected?: boolean }) {
  return (
    <div
      className={`p-1 rounded-md transition-colors ${
        isSelected ? "text-[var(--match-text)] font-bold" : "text-[var(--text-tertiary)]"
      }`}
    >
      <IconChevronRight className="w-4 h-4" />
    </div>
  );
}

export default function QuestionnaireList({
  selectedSupplier,
  loadingQuestionnaires,
  questionnaires,
  selectedQuestionnaire,
  onSelectQuestionnaire,
}: QuestionnaireListProps) {
  return (
    <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]">
            <IconFileDescription className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--heading-color)]">
              {selectedSupplier.supplier_name}
            </h3>
          </div>
        </div>
      </div>

      {loadingQuestionnaires ? (
        <div className="py-8 flex flex-col items-center justify-center gap-3 text-sm text-[var(--text-tertiary)]">
          <IconLoader2 className="w-6 h-6 animate-spin text-[var(--accent-primary-text)]" />
          <span>Loading supplier questionnaires</span>
        </div>
      ) : questionnaires.length === 0 ? (
        <div className="py-6 px-4 rounded-xl border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-tertiary)]">
          No questionnaires available for this supplier. Select another supplier from search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {questionnaires.map((q, idx) => {
            const docId = q.questionnaireId || q.docId || `Q-${idx}`;
            const title = q.title || q.docTitle || "Questionnaire";
            const isSelected = Boolean(
              selectedQuestionnaire &&
                (selectedQuestionnaire.questionnaireId === docId ||
                  selectedQuestionnaire.docId === docId)
            );

            return (
              <button
                key={`${docId}-${idx}`}
                type="button"
                onClick={() => onSelectQuestionnaire(q)}
                className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)] shadow-md"
                    : "border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <IconFileCheck
                      className={`w-4 h-4 shrink-0 ${
                        isSelected
                          ? "text-[var(--match-text)]"
                          : "text-[var(--accent-primary-text)]"
                      }`}
                    />
                    <span className="font-bold text-sm text-[var(--heading-color)] line-clamp-1">
                      {title}
                    </span>
                  </div>
                  <ChevronBadge isSelected={isSelected} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
