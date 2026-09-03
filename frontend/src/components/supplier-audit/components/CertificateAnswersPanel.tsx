"use client";

import { IconFileCheck, IconInfoCircle } from "@tabler/icons-react";
import type { CertificateAnswersPanelProps } from "../types";

export default function CertificateAnswersPanel({
  selectedQuestionnaire,
  loadingAnswers,
  answersData,
  certifiedQuestionsWithAttachments,
  running,
  onRunVerification,
}: CertificateAnswersPanelProps) {
  return (
    <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--accent-success-soft)] border border-[var(--accent-success-border)] text-[var(--match-text)]">
            <IconFileCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--heading-color)]">
              {selectedQuestionnaire.docTitle || selectedQuestionnaire.title}
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[var(--accent-success-soft)] text-[var(--match-text)] border border-[var(--accent-success-border)]">
              {certifiedQuestionsWithAttachments.length} certificate(s) to audit.
            </span>
          </div>
        </div>
      </div>

      {loadingAnswers ? (
        <div className="py-10 flex flex-col items-center justify-center gap-3 text-sm text-[var(--text-tertiary)]">
          <span className="w-6 h-6 border-2 border-[var(--accent-success-text)] border-t-transparent rounded-full animate-spin" />
          <span>Fetching questionnaire version answers from Ariba...</span>
        </div>
      ) : answersData ? (
        <div className="space-y-5">
          {/* Parsed Q&A Preview Cards for Certified Questions with Attachments */}
          <div className="space-y-3">
            {certifiedQuestionsWithAttachments.length > 0 ? (
              <div className="space-y-6">
                {certifiedQuestionsWithAttachments.map((qAns: any, aIdx: number) => {
                  const certData = qAns.certificateData || {};
                  const attachment = certData.attachment || {};
                  const cleanLabel = (qAns.questionLabel || "").replace(/<[^>]*>?/gm, "").trim();

                  return (
                    <div
                      key={qAns.itemId || aIdx}
                      className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-input)] p-5 space-y-4 shadow-sm"
                    >
                      {/* {question label} Header */}
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                        <h5 className="text-base font-bold text-[var(--heading-color)] tracking-tight">
                          {cleanLabel || certData.certificateType || `Question ${aIdx + 1}`}
                        </h5>
                      </div>

                      {/* 2-Column Table */}
                      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                        <table className="w-full text-left text-xs border-collapse">
                          <tbody className="divide-y divide-[var(--border-subtle)]/60 text-[var(--text-primary)]">
                            <tr>
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]/40 border-r border-[var(--border-subtle)]">
                                Certificate Type
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[var(--heading-color)]">
                                {certData.certificateType || "—"}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]/40 border-r border-[var(--border-subtle)]">
                                Issuer
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[var(--heading-color)]">
                                {certData.issuer || "—"}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]/40 border-r border-[var(--border-subtle)]">
                                Year of publication
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[var(--heading-color)] font-mono">
                                {certData.yearOfPublication || "—"}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]/40 border-r border-[var(--border-subtle)]">
                                Certificate Number
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[var(--heading-color)] font-mono">
                                {certData.certificateNumber || "—"}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]/40 border-r border-[var(--border-subtle)]">
                                Certificate Location
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[var(--heading-color)]">
                                {certData.certificateLocation || "—"}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]/40 border-r border-[var(--border-subtle)]">
                                Effective Date
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[var(--heading-color)] font-mono">
                                {certData.effectiveDate || "—"}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-2.5 px-4 font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]/40 border-r border-[var(--border-subtle)]">
                                Expiration Date
                              </td>
                              <td className="py-2.5 px-4 font-medium text-[var(--heading-color)] font-mono">
                                {certData.expirationDate || "—"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Attachment Info */}
                      {attachment && attachment.fileName && (
                        <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--accent-primary-border)]/60 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 truncate">
                            <IconFileCheck className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0" />
                            <div className="truncate">
                              <p className="font-bold text-[var(--heading-color)] truncate">
                                {attachment.fileName}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-5 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-input)] text-center text-xs text-[var(--text-tertiary)] space-y-1">
                <IconInfoCircle className="w-5 h-5 mx-auto text-[var(--text-tertiary)] mb-1" />
                <p className="font-semibold text-[var(--text-secondary)]">No Certified Attachments Found</p>
                <p>
                  No questions in this questionnaire match the rule:{" "}
                  <code className="font-mono bg-[var(--bg-card)] px-1 py-0.5 rounded">certified === true</code>{" "}
                  and <code className="font-mono bg-[var(--bg-card)] px-1 py-0.5 rounded">attachment != null</code>.
                </p>
              </div>
            )}
          </div>

          {/* Run Verification Trigger */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onRunVerification}
              disabled={running || certifiedQuestionsWithAttachments.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-success)] hover:bg-[var(--accent-success-hover)] text-white font-bold text-sm transition-all shadow-md shadow-[var(--accent-success-shadow)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? "Auditing Certificate…" : "Run CQ Audit"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
