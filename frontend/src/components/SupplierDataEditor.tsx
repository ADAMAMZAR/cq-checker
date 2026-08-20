"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  IconChevronLeft,
  IconLoader2,
  IconEdit,
  IconCircleCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";
import type { AuditRegistryEntry, DocumentEvidence, DocumentEvidenceSummary } from "@/types";
import { INITIAL_FORM_FIELDS } from "@/types";
import {
  fetchAuditRegistry,
  fetchEvidenceSummary,
  fetchEvidenceDocument,
  updateEvidenceMetadata,
} from "@/lib/api";
import { parseEvidenceMetadata, compareQuestionLabels } from "@/lib/utils";

import type { SupplierItem, SupplierDataEditorProps } from "./supplier-data-editor/types";
import SupplierPicker from "./supplier-data-editor/components/SupplierPicker";
import SupplierFileList from "./supplier-data-editor/components/SupplierFileList";
import CertificateViewer from "./supplier-data-editor/components/CertificateViewer";
import EditFormFields from "./supplier-data-editor/components/EditFormFields";

export default function SupplierDataEditor({ onRefreshLogs }: SupplierDataEditorProps) {
  const [registryLogs, setRegistryLogs] = useState<AuditRegistryEntry[]>([]);
  const [isRegistryLoading, setIsRegistryLoading] = useState(true);

  const [selectedSupplier, setSelectedSupplier] = useState<SupplierItem | null>(null);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");

  const [evidenceSummaries, setEvidenceSummaries] = useState<DocumentEvidenceSummary[]>([]);
  const [isSummariesLoading, setIsSummariesLoading] = useState(false);

  const [selectedEvidence, setSelectedEvidence] = useState<DocumentEvidence | null>(null);
  const [isDocLoading, setIsDocLoading] = useState(false);

  const [formFields, setFormFields] = useState<Record<string, string>>({ ...INITIAL_FORM_FIELDS });
  const [initialFields, setInitialFields] = useState<Record<string, string>>({ ...INITIAL_FORM_FIELDS });
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);

  // Initial Load: Fetch list of suppliers via audit-registry summary list
  const loadRegistry = useCallback(async () => {
    setIsRegistryLoading(true);
    try {
      const data = await fetchAuditRegistry();
      setRegistryLogs(data);
    } catch (err: unknown) {
      console.error("Failed to load audit registry for editor:", err);
    } finally {
      setIsRegistryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  // Unique list of suppliers derived from audit registry with useMemo
  const uniqueSuppliers: SupplierItem[] = useMemo(() => {
    return Array.from(
      new Map(
        registryLogs.map((log) => [
          log.supplier_id,
          { supplier_id: log.supplier_id, supplier_name: log.supplier_name },
        ])
      ).values()
    );
  }, [registryLogs]);

  // Filtered suppliers memoization to avoid search thrashing
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearchQuery.trim().toLowerCase();
    if (!q) return uniqueSuppliers;
    return uniqueSuppliers.filter((s) => s.supplier_name.toLowerCase().includes(q));
  }, [uniqueSuppliers, supplierSearchQuery]);

  // Click Supplier: Fetch lightweight certificate evidence summaries using supplier_id
  const handleSelectSupplier = async (supplier: SupplierItem) => {
    setSelectedSupplier(supplier);
    setSelectedEvidence(null);
    setEvidenceSummaries([]);
    setIsSummariesLoading(true);
    try {
      const summaries = await fetchEvidenceSummary({ supplierId: supplier.supplier_id });
      summaries.sort((a, b) =>
        compareQuestionLabels(a.ariba_question_label, b.ariba_question_label)
      );
      setEvidenceSummaries(summaries);
    } catch (err: unknown) {
      console.error("Failed to load supplier evidence summary:", err);
    } finally {
      setIsSummariesLoading(false);
    }
  };

  // Click Certificate: Fetch entire document evidence data using document ID
  const handleSelectCertificateSummary = async (summary: DocumentEvidenceSummary) => {
    setIsDocLoading(true);
    setFormSuccessMessage(null);
    setFormErrorMessage(null);
    try {
      const fullDoc = await fetchEvidenceDocument(summary.id);
      setSelectedEvidence(fullDoc);
      const fields = parseEvidenceMetadata(fullDoc);
      setFormFields(fields);
      setInitialFields(fields);
    } catch (err: unknown) {
      console.error("Failed to load full document evidence:", err);
      const msg = err instanceof Error ? err.message : "Failed to load document details.";
      setFormErrorMessage(msg);
    } finally {
      setIsDocLoading(false);
    }
  };

  const isFormDirty = Object.keys(formFields).some((key) => formFields[key] !== initialFields[key]);

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvidence) return;
    setIsSavingForm(true);
    setFormSuccessMessage(null);
    setFormErrorMessage(null);
    try {
      await updateEvidenceMetadata(
        selectedEvidence.audit_id,
        selectedEvidence.filename,
        formFields
      );
      setFormSuccessMessage("Successfully saved changes! Comparison table recalculated.");
      setInitialFields({ ...formFields });

      if (onRefreshLogs) {
        onRefreshLogs();
      }

      // Refetch updated document details using document ID
      if (selectedEvidence.id) {
        const updatedDoc = await fetchEvidenceDocument(selectedEvidence.id);
        setSelectedEvidence(updatedDoc);
      }
    } catch (err: unknown) {
      setFormErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred while saving."
      );
    } finally {
      setIsSavingForm(false);
    }
  };

  if (isDocLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12 gap-3">
        <IconLoader2 className="h-8 w-8 animate-spin text-[var(--accent-primary-text)]" />
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          Loading certificate document details...
        </span>
      </div>
    );
  }

  if (selectedEvidence) {
    return (
      <div className="flex-1 flex flex-col gap-5 min-h-0 lg:min-h-[600px]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedEvidence(null);
              setFormSuccessMessage(null);
              setFormErrorMessage(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-xs text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-all duration-200 cursor-pointer active:scale-95 shrink-0"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Change Certificate
          </button>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="text-[var(--match-text)] font-semibold shrink-0">
              {selectedSupplier?.supplier_name || selectedEvidence.supplier_name}
            </span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-[var(--text-primary)] font-medium truncate">
              {selectedEvidence.filename}
            </span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          <section className="lg:col-span-7 flex flex-col double-bezel">
            <div className="double-bezel-inner flex-1 flex flex-col h-full min-h-[520px] lg:min-h-[780px]">
              <CertificateViewer evidence={selectedEvidence} />
            </div>
          </section>

          <section className="lg:col-span-5 flex flex-col double-bezel">
            <div className="double-bezel-inner flex-1 flex flex-col h-full justify-between">
              <form onSubmit={handleSaveForm} className="flex-1 flex flex-col h-full justify-between">
                <div className="space-y-6">
                  <div className="border-b border-[var(--border-subtle)] pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--match-text)] bg-[var(--match-bg)] border border-[var(--match-border)] px-2 py-0.5 rounded-full">
                        Document Data
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono font-medium">
                        {selectedEvidence.timestamp}
                      </span>
                    </div>
                    <h3 className="text-lg text-[var(--text-tertiary)] mt-2 truncate">
                      File name:{" "}
                      <span className="font-bold text-[var(--heading-color)]">
                        {selectedEvidence.filename}
                      </span>
                    </h3>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Supplier:{" "}
                      <span className="font-semibold text-[var(--text-primary)]">
                        {selectedEvidence.supplier_name}
                      </span>
                    </p>
                  </div>

                  {formSuccessMessage && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="p-3 rounded-xl bg-[var(--match-bg)] border border-[var(--match-border)] text-xs text-[var(--match-text)] flex items-center gap-2 glow-success animate-fade-in"
                    >
                      <IconCircleCheck className="h-4.5 w-4.5 shrink-0" />
                      <span>{formSuccessMessage}</span>
                    </div>
                  )}
                  {formErrorMessage && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-[var(--mismatch-bg)] border border-[var(--accent-danger-border)] text-xs text-[var(--mismatch-text)] flex items-center gap-2 glow-error animate-fade-in"
                    >
                      <IconAlertTriangle className="h-4.5 w-4.5 shrink-0" />
                      <span>{formErrorMessage}</span>
                    </div>
                  )}

                  <EditFormFields fields={formFields} onChange={setFormFields} />
                </div>

                <div className="mt-8 border-t border-[var(--border-subtle)] pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingForm || !isFormDirty}
                    className="px-6 py-2.5 rounded-xl bg-[var(--accent-success-strong)] hover:bg-[var(--accent-success)] text-[var(--heading-color)] text-xs font-semibold tracking-wide transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] flex items-center gap-2 glow-success disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingForm ? (
                      <>
                        <IconLoader2 className="h-4 w-4 animate-spin" /> Saving Changes...
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch min-h-0 lg:min-h-[600px]">
      <section className="lg:col-span-4 flex flex-col min-h-0 lg:min-h-[600px] double-bezel">
        <div className="double-bezel-inner flex-1 flex flex-col h-full">
          {!selectedSupplier ? (
            <SupplierPicker
              searchQuery={supplierSearchQuery}
              onSearchChange={setSupplierSearchQuery}
              isLoading={isRegistryLoading}
              suppliers={filteredSuppliers}
              onSelect={handleSelectSupplier}
            />
          ) : (
            <SupplierFileList
              supplier={selectedSupplier}
              summaries={evidenceSummaries}
              isLoading={isSummariesLoading}
              onSelectFile={handleSelectCertificateSummary}
              onBack={() => {
                setSelectedSupplier(null);
                setSupplierSearchQuery("");
                setEvidenceSummaries([]);
              }}
            />
          )}
        </div>
      </section>

      <section className="lg:col-span-8 flex flex-col double-bezel">
        <div className="double-bezel-inner flex-1 flex flex-col h-full items-center justify-center text-center p-8">
          {isSummariesLoading ? (
            <div className="w-full space-y-4 animate-pulse">
              <div className="h-14 w-14 rounded-full bg-[var(--bg-surface-hover)] mx-auto flex items-center justify-center">
                <IconLoader2 className="h-6 w-6 animate-spin text-[var(--accent-primary-text)]" />
              </div>
              <div className="h-4 w-36 bg-[var(--bg-surface-hover)] rounded mx-auto" />
              <div className="h-3 w-56 bg-[var(--bg-surface-hover)] rounded mx-auto" />
            </div>
          ) : (
            <>
              <div className="h-14 w-14 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] flex items-center justify-center text-[var(--text-tertiary)] mb-4">
                <IconEdit className="h-6 w-6" />
              </div>
              <h3 className="text-md font-semibold text-[var(--heading-color)]">Select a certificate</h3>
              <p className="text-sm text-[var(--text-tertiary)] max-w-xs mt-1">
                Select a supplier name on the left and pick one of their certificates to verify or edit raw OCR details.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
