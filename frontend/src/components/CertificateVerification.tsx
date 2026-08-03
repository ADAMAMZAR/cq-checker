"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  IconCertificate,
  IconUpload,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import { verifyCertificate, fetchCertificates, buildFileUrl } from "@/lib/api";
import type {
  CertificateStatus,
  CertificateVerifyResult,
  CertificateVerificationResponse,
} from "@/types";

const FIELD_LABELS: Record<string, string> = {
  certificateOwnerName: "Supplier Name",
  issuerName: "Issuing Authority",
  certificateType: "Certificate Type",
  certificateNumber: "Certificate Number",
  expirationDate: "Expiry Date",
  effectiveDate: "Effective Date",
  yearOfPublication: "Year of Publication",
  certificateLocation: "Certificate Location",
};

export default function CertificateVerification() {
  const [file, setFile] = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [questionLabel, setQuestionLabel] = useState("");
  const [qaAnswers, setQaAnswers] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<CertificateVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CertificateVerificationResponse[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const historyFetched = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchCertificates());
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (!historyFetched.current) {
      historyFetched.current = true;
      loadHistory();
    }
  }, [loadHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !supplierName.trim()) return;
    setIsVerifying(true);
    setError(null);
    setResult(null);
    try {
      const res = await verifyCertificate(file, {
        supplierName: supplierName.trim(),
        questionLabel: questionLabel.trim() || undefined,
        qaAnswers: qaAnswers.trim() || undefined,
      });
      setResult(res);
      await loadHistory();
      if (file) {
        const input = document.getElementById("verify-file-input") as HTMLInputElement | null;
        if (input) input.value = "";
      }
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };

  const statusConfig: Record<CertificateStatus, { label: string; className: string; Icon: typeof IconCheck }> = {
    PASS: {
      label: "PASS",
      className: "bg-[var(--accent-success-soft)] text-[var(--accent-success-text)] border-[var(--accent-success-border)]",
      Icon: IconCheck,
    },
    FAIL: {
      label: "FAIL",
      className: "bg-[var(--accent-danger-soft)] text-[var(--accent-danger-text)] border-[var(--accent-danger-border)]",
      Icon: IconX,
    },
    REQUIRES_HUMAN_REVIEW: {
      label: "REQUIRES HUMAN REVIEW",
      className: "bg-[var(--accent-warning-soft)] text-[var(--accent-warning-text)] border-[var(--accent-warning-border)]",
      Icon: IconAlertTriangle,
    },
  };

  const badgeFor = (status: CertificateStatus) => {
    const cfg = statusConfig[status];
    const Icon = cfg.Icon;
    return (
      <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 ${cfg.className}`}>
        <Icon className="w-3.5 h-3.5" />
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full py-2 animate-fade-in">
      {/* Verify form */}
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-[var(--accent-success-soft)] border border-[var(--accent-success-border)] text-[var(--accent-success-text)]">
            <IconCertificate className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--heading-color)] tracking-tight">Verify a Certificate</h2>
            <p className="text-xs text-[var(--text-tertiary)]">DeepSeek extraction + Qwen reasoning judge with code-backed rules.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label
              htmlFor="verify-file-input"
              className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer md:row-span-3 ${
                file ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)]" : "border-[var(--border-visible)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary-border-focus)]"
              }`}
            >
              <IconUpload className={`w-6 h-6 ${file ? "text-[var(--accent-success-text)]" : "text-[var(--text-tertiary)]"}`} />
              {file ? (
                <span className="text-xs font-semibold text-[var(--heading-color)] text-center break-all">{file.name}</span>
              ) : (
                <span className="text-xs text-[var(--text-secondary)] text-center">Upload certificate PDF or image</span>
              )}
              <input
                id="verify-file-input"
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="space-y-4 md:col-start-2">
              <div>
                <label htmlFor="verify-supplier" className="block mb-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">
                  Supplier Name *
                </label>
                <input
                  id="verify-supplier"
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. ACME Construction Sdn Bhd"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border-focus)]"
                />
              </div>
              <div>
                <label htmlFor="verify-qlabel" className="block mb-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">
                  Ariba Question Label <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  id="verify-qlabel"
                  type="text"
                  value={questionLabel}
                  onChange={(e) => setQuestionLabel(e.target.value)}
                  placeholder="e.g. 1.1 CIDB Grade"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border-focus)]"
                />
              </div>
              <div>
                <label htmlFor="verify-qa" className="block mb-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">
                  QA Answers JSON <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  id="verify-qa"
                  type="text"
                  value={qaAnswers}
                  onChange={(e) => setQaAnswers(e.target.value)}
                  placeholder='[{"label":"type","value":"CIDB"}]'
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] font-mono focus:outline-none focus:border-[var(--accent-primary-border-focus)]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!file || !supplierName.trim() || isVerifying}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-success)] hover:bg-[var(--accent-success-hover)] text-white font-bold text-sm transition-all shadow-md shadow-[var(--accent-success-shadow)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconCertificate className="w-4 h-4" />
            {isVerifying ? "Verifying…" : "Run Verification"}
          </button>
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-[var(--accent-danger-border)] bg-[var(--accent-danger-soft)] p-4 text-sm text-[var(--accent-danger-text)]">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {badgeFor(result.status)}
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                <span>
                  Confidence <span className="font-mono font-bold text-[var(--heading-color)]">{(result.confidence * 100).toFixed(1)}%</span>
                </span>
                <span className="px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
                  judge: {result.judge_source}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                const value = result.extracted_data?.[key];
                if (value === undefined || value === null || value === "") return null;
                return (
                  <div key={key} className="rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] p-3">
                    <span className="block text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">{label}</span>
                    <span className="block text-sm font-semibold text-[var(--heading-color)] mt-0.5 break-words">{String(value)}</span>
                  </div>
                );
              })}
            </div>

            {result.reasoning_trace && (
              <div className="rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] mb-2">Judge reasoning</p>
                <div className="prose prose-sm max-w-none font-sans">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.reasoning_trace}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* History */}
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl">
        <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">Verification history</h3>
        {history.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] italic">No verifications yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((rec) => (
              <div key={rec.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {badgeFor(rec.status)}
                    <span className="text-sm font-semibold text-[var(--heading-color)] truncate">
                      {String(rec.extracted_data?.certificateOwnerName || "Certificate")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {rec.confidence !== null && rec.confidence !== undefined && (
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                        {(rec.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {rec.created_at && (
                      <span className="text-[10px] text-[var(--text-tertiary)] hidden sm:inline">
                        {new Date(rec.created_at).toLocaleString()}
                      </span>
                    )}
                    {expandedId === rec.id ? (
                      <IconChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" />
                    ) : (
                      <IconChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
                    )}
                  </div>
                </button>
                {expandedId === rec.id && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[var(--border-subtle)] pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(FIELD_LABELS).map(([key, label]) => {
                        const value = rec.extracted_data?.[key];
                        if (value === undefined || value === null || value === "") return null;
                        return (
                          <div key={key} className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2">
                            <span className="block text-[9px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">{label}</span>
                            <span className="block text-xs font-semibold text-[var(--heading-color)]">{String(value)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {rec.file_url && (
                      <a
                        href={buildFileUrl(rec.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary-text)] hover:text-[var(--accent-primary-text-hover)] transition-colors"
                      >
                        <IconCertificate className="w-3.5 h-3.5" />
                        View source file
                      </a>
                    )}
                    {rec.judge_reasoning && (
                      <div className="rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-tertiary)] mb-1">Judge reasoning</p>
                        <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{rec.judge_reasoning}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
