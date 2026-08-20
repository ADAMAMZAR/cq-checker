"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAribaSuppliers,
  fetchAribaQuestionnaires,
  fetchAribaQuestionnaireAnswers,
  auditAribaSupplier,
  type AribaQuestionnaireItem,
  type AribaQuestionnaireAnswersResponse,
} from "@/lib/api";
import type { SupplierEntry } from "@/types";
import type { SupplierAuditProps } from "./supplier-audit/types";

import SupplierAuditSkeleton from "./supplier-audit/components/SupplierAuditSkeleton";
import SupplierCombobox from "./supplier-audit/components/SupplierCombobox";
import QuestionnaireList from "./supplier-audit/components/QuestionnaireList";
import CertificateAnswersPanel from "./supplier-audit/components/CertificateAnswersPanel";
import AuditPipelineProgress from "./supplier-audit/components/AuditPipelineProgress";
import AuditVerdictCard from "./supplier-audit/components/AuditVerdictCard";

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
    } catch (err: unknown) {
      console.error("Failed to load questionnaires:", err);
      setError(`Could not retrieve questionnaires for ${sup.supplier_name}.`);
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
    } catch (err: unknown) {
      console.error("Failed to load questionnaire answers:", err);
      setError(`Could not fetch questionnaire answers for ${docId}.`);
    } finally {
      setLoadingAnswers(false);
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
    } catch (err: unknown) {
      console.error("[Ariba 2-Stage Audit Error]:", err);
      const msg = err instanceof Error ? err.message : "Failed to complete 2-stage Ariba audit pipeline.";
      setError(msg);
      setRunning(false);
    }
  };

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

  if (loadingInitialSuppliers) {
    return <SupplierAuditSkeleton />;
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full py-2 animate-fade-in">
      {/* STEP 1: Supplier Search Input Combobox */}
      <SupplierCombobox
        query={query}
        open={open}
        highlighted={highlighted}
        filtered={filtered}
        selectedSupplier={selectedSupplier}
        error={error}
        onQueryChange={(val) => {
          setQuery(val);
          setOpen(true);
          setHighlighted(0);
          if (selectedSupplier && val !== selectedSupplier.supplier_name) {
            setSelectedSupplier(null);
            setQuestionnaires([]);
            setSelectedQuestionnaire(null);
            setAnswersData(null);
          }
        }}
        onOpenChange={setOpen}
        onHighlightedChange={setHighlighted}
        onSelectSupplier={handleSelectSupplier}
        onSubmit={runVerification}
      />

      {/* STEP 2: Render Available Questionnaires for Selected Supplier */}
      {selectedSupplier && (
        <QuestionnaireList
          selectedSupplier={selectedSupplier}
          loadingQuestionnaires={loadingQuestionnaires}
          questionnaires={questionnaires}
          selectedQuestionnaire={selectedQuestionnaire}
          onSelectQuestionnaire={handleSelectQuestionnaire}
        />
      )}

      {/* STEP 3: Questionnaire Answers & Certificate Details */}
      {selectedQuestionnaire && (
        <section className="space-y-6">
          <CertificateAnswersPanel
            selectedQuestionnaire={selectedQuestionnaire}
            loadingAnswers={loadingAnswers}
            answersData={answersData}
            certifiedQuestionsWithAttachments={certifiedQuestionsWithAttachments}
            running={running}
            onRunVerification={runVerification}
          />

          {/* Audit Pipeline Progress Stepper */}
          <AuditPipelineProgress
            running={running}
            selectedSupplier={selectedSupplier}
            stage={stage}
          />

          {/* Audit Verdict Card Result */}
          <AuditVerdictCard
            auditResult={auditResult}
            selectedSupplier={selectedSupplier}
            running={running}
            onNavigateToRegistry={onNavigateToRegistry}
          />
        </section>
      )}
    </div>
  );
}