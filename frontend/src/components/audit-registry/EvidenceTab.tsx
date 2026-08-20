"use client";

import { IconPhoto, IconExternalLink, IconArrowUpRight } from "@tabler/icons-react";
import { buildFileUrl } from "@/lib/api";
import { cleanQuestionLabel, getLabelSortKey, parseEvidenceMetadata } from "@/lib/utils";
import type { EvidenceTabProps } from "./types";

export default function EvidenceTab({
  log,
  assets,
  assetsLoading,
  isEvidenceLoading,
  evidenceLogs,
  onScreenshotClick,
}: EvidenceTabProps) {
  if (isEvidenceLoading) {
    return (
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-none lg:max-h-[620px] pr-2">
        <div className="space-y-6 animate-pulse">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-4">
              <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2.5">
                <div className="h-3 w-48 bg-[var(--bg-surface-hover)] rounded" />
                <div className="h-3 w-16 bg-[var(--bg-surface-hover)] rounded" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 space-y-2.5">
                  <div className="h-3 w-28 bg-[var(--bg-surface-hover)] rounded" />
                  <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                    <div className="h-3 w-full bg-[var(--bg-surface-hover)] rounded" />
                    <div className="h-3 w-3/4 bg-[var(--bg-surface-hover)] rounded" />
                  </div>
                </div>
                <div className="lg:col-span-6 space-y-2.5">
                  <div className="h-3 w-28 bg-[var(--bg-surface-hover)] rounded" />
                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] space-y-1.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <div className="h-3 w-24 bg-[var(--bg-surface-hover)] rounded" />
                        <div className="h-3 w-20 bg-[var(--bg-surface-hover)] rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const matchingEvidence = evidenceLogs.filter(
    (e) =>
      e.supplier_name.toLowerCase() ===
      (log.supplier_name || log.comparison_table?.supplier_name || "").toLowerCase()
  );
  const visibleDocs = assets.documents.filter((doc) => doc.name.toLowerCase() !== "qa_data.json");

  const parsedQA = matchingEvidence.map((e) => {
    let answers = [];
    try {
      answers = JSON.parse(e.ariba_qa_answers || "[]");
    } catch {
      answers = [];
    }
    return {
      questionLabel: e.ariba_question_label,
      filename: e.filename,
      answers,
      original_evidence: e,
    };
  });

  parsedQA.sort((a, b) => {
    const keyA = getLabelSortKey(a.questionLabel);
    const keyB = getLabelSortKey(b.questionLabel);
    for (let i = 0; i < Math.max(keyA.length, keyB.length); i++) {
      const valA = keyA[i] ?? 0;
      const valB = keyB[i] ?? 0;
      if (valA !== valB) return valA - valB;
    }
    return 0;
  });

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto max-h-none lg:max-h-[620px] pr-2">
      <div className="space-y-6">
        {parsedQA.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] italic">No evidence records found.</p>
        ) : (
          parsedQA.map((item, idx) => {
            const ev = item.original_evidence;
            const matchingDoc = visibleDocs.find(
              (d) =>
                d.name.toLowerCase() === ev.filename.toLowerCase() ||
                ev.filename.toLowerCase().includes(d.name.toLowerCase()) ||
                d.name.toLowerCase().includes(ev.filename.toLowerCase())
            );
            const geminiData = parseEvidenceMetadata(ev);

            return (
              <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                  <h4 className="text-xs font-bold text-[var(--heading-color)] truncate max-w-full sm:max-w-[450px]">
                    {cleanQuestionLabel(ev.ariba_question_label)}
                  </h4>
                  <span className="text-[9px] uppercase font-bold text-[var(--match-text)] tracking-wider px-2 py-0.5 rounded bg-[var(--match-bg)] border border-[var(--match-border)] shrink-0">
                    {ev.filename}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Questionnaire Answers */}
                  <div className="lg:col-span-6 space-y-2.5">
                    <h5 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                      Questionnaire Answers
                    </h5>
                    {item.answers.length === 0 ? (
                      <p className="text-xs text-[var(--text-tertiary)] italic">No Q&A Answers available.</p>
                    ) : (
                      <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                        {item.answers.map((ans: any, aIdx: number) => (
                          <div key={aIdx} className="text-xs flex gap-2">
                            <span className="text-[var(--text-tertiary)] font-medium shrink-0">{ans.label}:</span>
                            <span className="text-[var(--text-primary)] font-medium">{ans.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Extracted Metadata */}
                  <div className="lg:col-span-6 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <h5 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                        Extracted Metadata
                      </h5>
                      {matchingDoc && (
                        <a
                          href={buildFileUrl(matchingDoc.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[9px] text-[var(--match-text)] hover:underline transition-colors"
                        >
                          Open PDF <IconArrowUpRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {geminiData && Object.keys(geminiData).length > 0 ? (
                      <div className="p-2.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[11px] space-y-1.5 font-mono text-[var(--text-secondary)]">
                        <div className="flex justify-between gap-2">
                          <span>Extracted Supplier:</span>
                          <span className="text-[var(--heading-color)] truncate max-w-[140px] font-sans">
                            {geminiData.certificateOwnerName || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Issuer Name:</span>
                          <span className="text-[var(--heading-color)] truncate max-w-[140px] font-sans">
                            {geminiData.issuerName || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Cert Type:</span>
                          <span className="text-[var(--heading-color)] truncate max-w-[140px] font-sans">
                            {geminiData.certificateType || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cert Number:</span>
                          <span className="text-[var(--heading-color)]">{geminiData.certificateNumber || "N/A"}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Location:</span>
                          <span className="text-[var(--heading-color)] truncate max-w-[150px] font-sans">
                            {geminiData.certificateLocation || "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Effective Date:</span>
                          <span className="text-[var(--heading-color)]">{geminiData.effectiveDate || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Expiration Date:</span>
                          <span className="text-[var(--heading-color)]">{geminiData.expirationDate || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Publication Year:</span>
                          <span className="text-[var(--heading-color)]">{geminiData.yearOfPublication || "N/A"}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-tertiary)] italic">No extracted metadata available.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Screen Captures Grid */}
      {assets.screenshots.length > 0 && (
        <div className="border-t border-[var(--border-subtle)] pt-6 mt-6">
          <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <IconPhoto className="h-4.5 w-4.5 text-[var(--match-text)]" />
            Audit Validation Screen Captures ({assets.screenshots.length})
          </h4>
          {assetsLoading ? (
            <div className="h-16 bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded-xl animate-pulse" />
          ) : (
            <div className="flex flex-wrap gap-3">
              {assets.screenshots.map((shot, idx) => {
                const fullShotUrl = buildFileUrl(shot);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onScreenshotClick(fullShotUrl)}
                    className="w-[10%] min-w-[80px] aspect-video border border-[var(--border-subtle)] rounded overflow-hidden relative group cursor-zoom-in bg-[var(--bg-input)]"
                    title="Expand capture"
                    aria-label="Expand screenshot capture"
                  >
                    <img
                      src={fullShotUrl}
                      alt="Audit verification capture"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                    />
                    <div className="absolute inset-0 bg-[var(--bg-surface)] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                      <IconExternalLink className="h-3 w-3 text-[var(--heading-color)]" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
