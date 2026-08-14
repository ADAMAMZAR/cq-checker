"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconCertificate,
  IconSearch,
  IconChevronDown,
  IconLoader2,
  IconCheck,
  IconFileDescription,
  IconChevronRight,
  IconInfoCircle,
  IconFileCheck,
} from "@tabler/icons-react";
import {
  fetchAribaSuppliers,
  fetchAribaQuestionnaires,
  fetchAribaQuestionnaireAnswers,
  downloadAribaQuestionnaireAttachments,
  auditAribaSupplier,
  type AribaQuestionnaireItem,
  type AribaQuestionnaireAnswersResponse,
} from "@/lib/api";
import type { SupplierEntry } from "@/types";

interface SupplierAuditProps {
  onNavigateToRegistry?: (supplierName: string) => void;
}

const STAGES = [
  "Downloading attachment files from SAP Ariba",
  "Extracting PDF evidence via Gemini 3.5 Flash (QA Context Injected)",
  "Running Python compliance auditor & persisting to Registry",
];

export default function SupplierAudit({ onNavigateToRegistry }: SupplierAuditProps = {}) {
  const [loadingInitialSuppliers, setLoadingInitialSuppliers] = useState(true);
  const [suppliers, setSuppliers] = useState<SupplierEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierEntry | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  // Step 2: Questionnaires state
  const [loadingQuestionnaires, setLoadingQuestionnaires] = useState(false);
  const [questionnaires, setQuestionnaires] = useState<AribaQuestionnaireItem[]>([]);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<AribaQuestionnaireItem | null>(null);

  // Step 3: Answers state
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [answersData, setAnswersData] = useState<AribaQuestionnaireAnswersResponse | null>(null);

  // Full verification pipeline state
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<any>(null);

  const fetched = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Load live Ariba suppliers ONLY on component mount
  const loadSuppliers = useCallback(async () => {
    setLoadingInitialSuppliers(true);
    try {
      const aribaList = await fetchAribaSuppliers();
      aribaList.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
      setSuppliers(aribaList);
    } catch {
      setError("Could not load Ariba supplier list. Please check backend connection.");
    } finally {
      setLoadingInitialSuppliers(false);
    }
  }, []);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      loadSuppliers();
    }
  }, [loadSuppliers]);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
    },
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.supplier_name.toLowerCase().includes(q) ||
        (s.sm_vendor_id && s.sm_vendor_id.toLowerCase().includes(q))
    );
  }, [suppliers, query]);

  // Step 2: Fetch questionnaires when supplier is selected
  const handleSelectSupplier = async (sup: SupplierEntry) => {
    setSelectedSupplier(sup);
    setQuery(sup.supplier_name);
    setOpen(false);

    // Reset downstream selections
    setQuestionnaires([]);
    setSelectedQuestionnaire(null);
    setAnswersData(null);
    setError(null);

    const smId = sup.sm_vendor_id;
    if (!smId) {
      setError(`Selected supplier (${sup.supplier_name}) does not have an SM Vendor ID for Ariba questionnaires.`);
      return;
    }

    setLoadingQuestionnaires(true);
    try {
      const res = await fetchAribaQuestionnaires(smId);
      const activeQuestionnaires = (res.questionnaires || []).filter(
        (q) => q.status?.toLowerCase() !== "notresponded"
      );
      setQuestionnaires(activeQuestionnaires);
      if (activeQuestionnaires.length === 0) {
        setError(`No submitted questionnaires found for Vendor: ${smId}`);
      }
    } catch (err: any) {
      console.error("Failed to load questionnaires:", err);
      setError(`Could not retrieve questionnaires for ${sup.supplier_name} (${smId}).`);
    } finally {
      setLoadingQuestionnaires(false);
    }
  };

  // Step 3: Fetch questionnaire answers when questionnaire is clicked
  const handleSelectQuestionnaire = async (q: AribaQuestionnaireItem) => {
    const smVendorId = selectedSupplier?.sm_vendor_id;
    if (!smVendorId) return;
    const docId = q.questionnaireId || q.docId;
    if (!docId) return;

    setSelectedQuestionnaire(q);
    setAnswersData(null);
    setLoadingAnswers(true);
    setError(null);

    try {
      const res = await fetchAribaQuestionnaireAnswers(smVendorId, docId);
      setAnswersData(res);
    } catch (err: any) {
      console.error("Failed to load questionnaire answers:", err);
      setError(`Could not fetch questionnaire answers for ${docId}.`);
    } finally {
      setLoadingAnswers(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) handleSelectSupplier(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const runVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    const smVendorId = selectedSupplier?.sm_vendor_id;
    if (!selectedSupplier || !smVendorId || !selectedQuestionnaire || running) return;

    const docId = selectedQuestionnaire.questionnaireId || selectedQuestionnaire.docId;
    if (!docId) return;

    setError(null);
    setAuditResult(null);
    setRunning(true);
    setStage(0);

    try {
      setStage(1);
      // Stage 1 & 2: Download attachments ➔ Gemini 3.5 Flash Vision OCR ➔ Python Auditor ➔ DB Log
      const res = await auditAribaSupplier(smVendorId, docId);
      console.log("[Ariba 2-Stage Audit Result]:", res);

      setStage(2);
      await new Promise((r) => setTimeout(r, 600));

      setAuditResult(res);
      setRunning(false);
    } catch (err: any) {
      console.error("[Ariba 2-Stage Audit Error]:", err);
      setError(err.message || "Failed to complete 2-stage Ariba audit pipeline.");
      setRunning(false);
    }
  };

  const isStageActive = (i: number) => i === stage;
  const isStageDone = (i: number) => i < stage;

  // Filter questions matching rule: certified === true AND attachment != null
  const certifiedQuestionsWithAttachments = useMemo(() => {
    if (!answersData) return [];
    const rawQna = answersData.qna_data || answersData;
    const embedded = rawQna?._embedded || rawQna;
    const versionList = embedded?.versionAnswersList || [];

    const items: any[] = [];
    for (const verItem of versionList) {
      const qList = verItem.questionAnswer || verItem.answers || verItem.answersList || [];
      for (const qAns of qList) {
        const certData = qAns.certificateData;
        const isCertified = certData?.certified === true;
        const hasAttachment = Boolean(
          certData?.attachment &&
          (certData.attachment.fileName || certData.attachment.id)
        );

        if (isCertified && hasAttachment) {
          items.push(qAns);
        }
      }
    }
    return items;
  }, [answersData]);

  // Format extracted QA data payload identically to browser extension output format
  const extractedQAData = useMemo(() => {
    if (!certifiedQuestionsWithAttachments.length) return [];

    return certifiedQuestionsWithAttachments.map((qAns: any) => {
      const certData = qAns.certificateData || {};
      const attachment = certData.attachment || {};
      const cleanLabel = (qAns.questionLabel || "").replace(/<[^>]*>?/gm, "").trim();

      return {
        sectionLabel: selectedQuestionnaire?.docTitle || selectedQuestionnaire?.title || "Certificates",
        questionLabel: cleanLabel || certData.certificateType || "Certificate Question",
        answers: [
          { label: "Certificate Type", value: certData.certificateType || "" },
          { label: "Issuer", value: certData.issuer || "" },
          { label: "Year of publication", value: certData.yearOfPublication || "" },
          { label: "Certificate Number", value: certData.certificateNumber || "" },
          { label: "Certificate Location", value: certData.certificateLocation || "" },
          { label: "Effective Date", value: certData.effectiveDate || "" },
          { label: "Expiration Date", value: certData.expirationDate || "" },
        ],
        attachedFile: attachment.fileName || ""
      };
    });
  }, [certifiedQuestionsWithAttachments, selectedQuestionnaire]);

  if (loadingInitialSuppliers) {
    return <SupplierAuditSkeleton />;
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full py-2 animate-fade-in">
      {/* ── STEP 1: Supplier Search Input ───────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-[var(--accent-success-soft)] border border-[var(--accent-success-border)] text-[var(--accent-success-text)]">
            <IconCertificate className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--heading-color)] tracking-tight">
              CQ Checker
            </h2>
            <p className="text-xs text-[var(--text-tertiary)]">
              Search by supplier name or SM Vendor ID to retrieve live Ariba questionnaires & answers
            </p>
          </div>
        </div>

        <form onSubmit={runVerification} className="space-y-4">
          <div>
            <label
              htmlFor="cq-supplier"
              className="block mb-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--text-tertiary)]"
            >
              Search Supplier *
            </label>
            <div className="relative">
              <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4 w-4" />
              <input
                id="cq-supplier"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setHighlighted(0);
                  if (selectedSupplier && e.target.value !== selectedSupplier.supplier_name) {
                    setSelectedSupplier(null);
                    setQuestionnaires([]);
                    setSelectedQuestionnaire(null);
                    setAnswersData(null);
                  }
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                onKeyDown={handleKeyDown}
                placeholder="Type letter or vendor ID"
                aria-label="Supplier Name"
                role="combobox"
                aria-expanded={open}
                aria-controls="cq-supplier-listbox"
                aria-autocomplete="list"
                autoComplete="off"
                className="w-full pl-11 pr-10 py-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border-focus)] transition-all"
              />
              <IconChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4 w-4 pointer-events-none" />

              {open && (
                <ul
                  id="cq-supplier-listbox"
                  className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-2xl py-1.5"
                  role="listbox"
                >
                  {filtered.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-[var(--text-tertiary)] italic">
                      No matching suppliers found. Type to search live Ariba database.
                    </li>
                  ) : (
                    filtered.map((sup, idx) => (
                      <li key={`${sup.supplier_name}-${sup.sm_vendor_id || idx}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedSupplier?.supplier_name === sup.supplier_name}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectSupplier(sup);
                          }}
                          onMouseEnter={() => setHighlighted(idx)}
                          className={`w-full flex items-center justify-between gap-2.5 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer ${highlighted === idx
                            ? "bg-[var(--accent-success-soft)] text-[var(--heading-color)]"
                            : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                            }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span className="truncate font-medium">{sup.supplier_name}</span>
                          </div>
                          {selectedSupplier?.supplier_name === sup.supplier_name && (
                            <IconCheck className="ml-auto h-4 w-4 shrink-0 text-[var(--match-text)]" />
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-[var(--accent-danger-border)] bg-[var(--accent-danger-soft)] p-4 text-sm text-[var(--accent-danger-text)] flex items-center gap-2">
            <IconInfoCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* ── STEP 2: Render Available Questionnaires for Selected Supplier ──────── */}
      {selectedSupplier && (
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
                const isSelected = Boolean(selectedQuestionnaire && (selectedQuestionnaire.questionnaireId === docId || selectedQuestionnaire.docId === docId));

                return (
                  <button
                    key={`${docId}-${idx}`}
                    type="button"
                    onClick={() => handleSelectQuestionnaire(q)}
                    className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer ${isSelected
                      ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)] shadow-md"
                      : "border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-[var(--border-visible)] hover:bg-[var(--bg-surface-hover)]"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <IconFileCheck className={`w-4 h-4 shrink-0 ${isSelected ? "text-[var(--match-text)]" : "text-[var(--accent-primary-text)]"}`} />
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
      )}

      {/* ── STEP 3: Questionnaire Answers & Certificate Details ─────────────── */}
      {selectedQuestionnaire && (
        <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl space-y-5 animate-fade-in">
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
              <IconLoader2 className="w-6 h-6 animate-spin text-[var(--accent-success-text)]" />
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
                                  <p className="font-bold text-[var(--heading-color)] truncate">{attachment.fileName}</p>
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
                    <p>No questions in this questionnaire match the rule: <code className="font-mono bg-[var(--bg-card)] px-1 py-0.5 rounded">certified === true</code> and <code className="font-mono bg-[var(--bg-card)] px-1 py-0.5 rounded">attachment != null</code>.</p>
                  </div>
                )}
              </div>

              {/* Run Verification Trigger */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={runVerification}
                  disabled={running || certifiedQuestionsWithAttachments.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-success)] hover:bg-[var(--accent-success-hover)] text-white font-bold text-sm transition-all shadow-md shadow-[var(--accent-success-shadow)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {running ? "Auditing Certificate…" : "Run CQ Audit"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Loading Animation Progress */}
          {running && selectedSupplier && (
            <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-5 space-y-4">
              <div className="flex items-center gap-3">
                <IconLoader2 className="h-5 w-5 animate-spin text-[var(--accent-success-text)]" />
                <div>
                  <p className="text-sm font-bold text-[var(--heading-color)]">Running Supplier Audit</p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">Supplier: {selectedSupplier.supplier_name}</p>
                </div>
              </div>
              <div className="space-y-2">
                {STAGES.map((label, i) => {
                  const active = isStageActive(i);
                  const done = isStageDone(i);
                  return (
                    <div
                      key={label}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${active
                        ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)]"
                        : done
                          ? "border-[var(--border-subtle)] bg-[var(--bg-input)]"
                          : "border-[var(--border-subtle)] bg-[var(--bg-input)] opacity-60"
                        }`}
                    >
                      {done ? (
                        <IconCheck className="h-4 w-4 text-[var(--match-text)]" />
                      ) : active ? (
                        <IconLoader2 className="h-4 w-4 animate-spin text-[var(--accent-success-text)]" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border-2 border-[var(--border-subtle)]" />
                      )}
                      <span
                        className={`text-sm font-semibold ${active
                          ? "text-[var(--heading-color)]"
                          : done
                            ? "text-[var(--match-text)]"
                            : "text-[var(--text-tertiary)]"
                          }`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit Result Card */}
          {auditResult && selectedSupplier && !running && (
            <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${auditResult.audit_result === "Match" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                    <IconFileCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[var(--heading-color)]">Audit Verification Completed</h4>
                    <p className="text-xs text-[var(--text-tertiary)]">Audit ID: {auditResult.audit_id || "N/A"}</p>
                  </div>
                </div>

                <div className={`px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide border ${auditResult.audit_result === "Match"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                  }`}>
                  {auditResult.audit_result === "Match" ? "PASS / MATCH" : "MISMATCH DETECTED"}
                </div>
              </div>

              {/* Suggested Comment / Discrepancies */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Audit Verdict & Suggested Comment:</p>
                <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] font-mono text-xs text-[var(--heading-color)] whitespace-pre-wrap leading-relaxed">
                  {auditResult.suggested_comment || "All certificate requirements matched successfully."}
                </div>
              </div>

              {/* Registry Navigation Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigateToRegistry?.(selectedSupplier.supplier_name)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-sm transition-all shadow-md active:scale-[0.98] cursor-pointer"
                >
                  View Record in Audit Registry
                  <IconChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ChevronBadge({ isSelected }: { isSelected?: boolean }) {
  return (
    <div className={`p-1 rounded-md transition-colors ${isSelected ? "text-[var(--match-text)] font-bold" : "text-[var(--text-tertiary)]"}`}>
      <IconChevronRight className="w-4 h-4" />
    </div>
  );
}

function SupplierAuditSkeleton() {
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full py-2 animate-fade-in">
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] animate-pulse shrink-0">
            <div className="w-5 h-5 bg-[var(--border-subtle)]/60 rounded" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="h-5 w-64 bg-[var(--bg-input)] rounded-md animate-pulse" />
            <div className="h-3 w-80 max-w-full bg-[var(--bg-input)] rounded-md animate-pulse" />
          </div>
        </div>

        {/* Input Label & Field Skeleton */}
        <div className="space-y-2">
          <div className="h-3 w-28 bg-[var(--bg-input)] rounded-md animate-pulse" />
          <div className="h-12 w-full rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] animate-pulse flex items-center justify-between px-4">
            <div className="h-4 w-48 bg-[var(--border-subtle)]/60 rounded animate-pulse" />
            <div className="h-4 w-4 bg-[var(--border-subtle)]/60 rounded animate-pulse" />
          </div>
        </div>

        {/* Status Loading Bar */}
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-[var(--text-tertiary)] font-medium">
          <IconLoader2 className="w-4 h-4 animate-spin text-[var(--accent-primary-text)]" />
        </div>
      </section>
    </div>
  );
}
