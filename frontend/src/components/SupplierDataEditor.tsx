"use client";

import { useState, useEffect, useCallback, useId } from "react";
import {
  IconSearch, IconChevronLeft, IconEdit, IconFiles, IconLoader2,
  IconArrowUpRight, IconDownload, IconCircleCheck, IconAlertTriangle
} from "@tabler/icons-react";
import type { AuditRegistryEntry, DocumentEvidence, DocumentEvidenceSummary } from "@/types";
import { INITIAL_FORM_FIELDS } from "@/types";
import { fetchAuditRegistry, fetchEvidenceSummary, fetchEvidenceDocument, updateEvidenceMetadata, buildFileUrl } from "@/lib/api";
import { cleanQuestionLabel, parseEvidenceMetadata, compareQuestionLabels } from "@/lib/utils";

interface SupplierItem {
  supplier_id: number;
  supplier_name: string;
}

interface SupplierDataEditorProps {
  onRefreshLogs?: () => void;
}

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

  // 1. Initial Load: Fetch list of suppliers via audit-registry summary list
  const loadRegistry = useCallback(async () => {
    setIsRegistryLoading(true);
    try {
      const data = await fetchAuditRegistry();
      setRegistryLogs(data);
    } catch (err: any) {
      console.error("Failed to load audit registry for editor:", err);
    } finally {
      setIsRegistryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  // Unique list of suppliers (supplier_id + supplier_name) derived from audit registry summary
  const uniqueSuppliers: SupplierItem[] = Array.from(
    new Map(
      registryLogs.map(log => [
        log.supplier_id,
        { supplier_id: log.supplier_id, supplier_name: log.supplier_name }
      ])
    ).values()
  );

  const filteredSuppliers = uniqueSuppliers.filter(s =>
    s.supplier_name.toLowerCase().includes(supplierSearchQuery.toLowerCase())
  );

  // 2. Click Supplier: Fetch lightweight certificate evidence summaries using supplier_id
  const handleSelectSupplier = async (supplier: SupplierItem) => {
    setSelectedSupplier(supplier);
    setSelectedEvidence(null);
    setEvidenceSummaries([]);
    setIsSummariesLoading(true);
    try {
      const summaries = await fetchEvidenceSummary({ supplierId: supplier.supplier_id });
      summaries.sort((a, b) => compareQuestionLabels(a.ariba_question_label, b.ariba_question_label));
      setEvidenceSummaries(summaries);
    } catch (err: any) {
      console.error("Failed to load supplier evidence summary:", err);
    } finally {
      setIsSummariesLoading(false);
    }
  };

  // 3. Click Certificate: Fetch entire document evidence data using document ID
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
    } catch (err: any) {
      console.error("Failed to load full document evidence:", err);
      setFormErrorMessage(err.message || "Failed to load document details.");
    } finally {
      setIsDocLoading(false);
    }
  };

  const isFormDirty = Object.keys(formFields).some(key => formFields[key] !== initialFields[key]);

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
      setFormErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred while saving.");
    } finally {
      setIsSavingForm(false);
    }
  };

  if (isDocLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12 gap-3">
        <IconLoader2 className="h-8 w-8 animate-spin text-[var(--accent-primary-text)]" />
        <span className="text-sm font-medium text-[var(--text-secondary)]">Loading certificate document details...</span>
      </div>
    );
  }

  if (selectedEvidence) {
    return (
      <div className="flex-1 flex flex-col gap-5 min-h-0 lg:min-h-[600px]">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedEvidence(null); setFormSuccessMessage(null); setFormErrorMessage(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-xs text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-all duration-200 cursor-pointer active:scale-95 shrink-0"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Change Certificate
          </button>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="text-[var(--match-text)] font-semibold shrink-0">{selectedSupplier?.supplier_name || selectedEvidence.supplier_name}</span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-[var(--text-primary)] font-medium truncate">{selectedEvidence.filename}</span>
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
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--match-text)] bg-[var(--match-bg)] border border-[var(--match-border)] px-2 py-0.5 rounded-full">Document Data</span>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono font-medium">{selectedEvidence.timestamp}</span>
                    </div>
                    <h3 className="text-lg text-[var(--text-tertiary)] mt-2 truncate">File name: <span className="font-bold text-[var(--heading-color)]"> {selectedEvidence.filename}</span></h3>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Supplier: <span className="font-semibold text-[var(--text-primary)]">{selectedEvidence.supplier_name}</span></p>
                  </div>

                  {formSuccessMessage && (
                    <div role="status" aria-live="polite" className="p-3 rounded-xl bg-[var(--match-bg)] border border-[var(--match-border)] text-xs text-[var(--match-text)] flex items-center gap-2 glow-success animate-fade-in">
                      <IconCircleCheck className="h-4.5 w-4.5 shrink-0" /><span>{formSuccessMessage}</span>
                    </div>
                  )}
                  {formErrorMessage && (
                    <div role="alert" className="p-3 rounded-xl bg-[var(--mismatch-bg)] border border-[var(--accent-danger-border)] text-xs text-[var(--mismatch-text)] flex items-center gap-2 glow-error animate-fade-in">
                      <IconAlertTriangle className="h-4.5 w-4.5 shrink-0" /><span>{formErrorMessage}</span>
                    </div>
                  )}

                  <EditFormFields fields={formFields} onChange={setFormFields} />
                </div>

                <div className="mt-8 border-t border-[var(--border-subtle)] pt-4 flex justify-end">
                  <button type="submit" disabled={isSavingForm || !isFormDirty}
                    className="px-6 py-2.5 rounded-xl bg-[var(--accent-success-strong)] hover:bg-[var(--accent-success)] text-[var(--heading-color)] text-xs font-semibold tracking-wide transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] flex items-center gap-2 glow-success disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingForm ? <><IconLoader2 className="h-4 w-4 animate-spin" /> Saving Changes...</> : "Save"}
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
              onBack={() => { setSelectedSupplier(null); setSupplierSearchQuery(""); setEvidenceSummaries([]); }}
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

/* ─── Subcomponents ─── */

function SupplierPicker({ searchQuery, onSearchChange, isLoading, suppliers, onSelect }: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  isLoading: boolean;
  suppliers: SupplierItem[];
  onSelect: (supplier: SupplierItem) => void;
}) {
  return (
    <>
      <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">Supplier Registry</h3>
      <div className="relative mb-6">
        <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4.5 w-4.5" />
        <input type="text" placeholder="Search supplier..." value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search suppliers"
          className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 max-h-none lg:max-h-[480px] pr-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse">
              <div className="h-4 w-3/4 bg-[var(--bg-surface-hover)] rounded mb-2"></div>
            </div>
          ))
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-tertiary)]"><p className="text-sm">No suppliers found.</p></div>
        ) : (
          suppliers.map(sup => (
            <button key={sup.supplier_id} type="button" onClick={() => onSelect(sup)}
              className="w-full text-left p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-success)] hover:bg-[var(--accent-success-soft)] transition-all duration-300 cursor-pointer flex justify-between items-center"
            >
              <h4 className="font-semibold text-sm text-[var(--heading-color)]">{sup.supplier_name}</h4>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function SupplierFileList({ supplier, summaries, isLoading, onSelectFile, onBack }: {
  supplier: SupplierItem;
  summaries: DocumentEvidenceSummary[];
  isLoading: boolean;
  onSelectFile: (summary: DocumentEvidenceSummary) => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border-subtle)]">
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer active:scale-95 shrink-0"
        >
          <IconChevronLeft className="h-4 w-4" />
          Back to Suppliers
        </button>
      </div>
      <div className="flex-1 flex flex-col">
        <h3 className="text-sm font-bold text-[var(--heading-color)] mb-1 truncate">Supplier: <span className="text-[var(--match-text)]">{supplier.supplier_name}</span></h3>
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 mt-2 flex items-center gap-1.5">
          <IconFiles className="h-4 w-4 text-[var(--match-text)]" />
          Available Certificates ({summaries.length})
        </h4>
        <div className="flex-1 overflow-y-auto space-y-3 max-h-none lg:max-h-[420px] pr-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse space-y-2">
                <div className="h-3.5 w-3/4 bg-[var(--bg-surface-hover)] rounded" />
                <div className="h-2.5 w-1/2 bg-[var(--bg-surface-hover)] rounded" />
              </div>
            ))
          ) : summaries.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] italic">No certificates recorded for this supplier.</p>
          ) : (
            summaries.map(s => (
              <button key={s.id} type="button" onClick={() => onSelectFile(s)}
                className="w-full text-left p-4 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] hover:border-[var(--accent-success)] hover:bg-[var(--accent-success-soft)] transition-all duration-300 cursor-pointer"
              >
                <div className="flex justify-between items-start mb-1.5">
                  <p className="text-xs font-semibold text-[var(--heading-color)] truncate pr-2">{s.filename}</p>
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-medium truncate">{cleanQuestionLabel(s.ariba_question_label)}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function CertificateViewer({ evidence }: { evidence: DocumentEvidence }) {
  const fileUrl = evidence.file_url;
  const proxyUrl = fileUrl ? buildFileUrl(fileUrl) : null;
  const ct = (evidence.file_content_type || '').toLowerCase();

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] text-[var(--text-tertiary)]">
        File not available (no stored file URL)
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-subtle)] shrink-0">
        <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Certificate Document</h3>
        <a href={proxyUrl ?? ""} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-[10px] text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-all duration-200 cursor-pointer active:scale-95"
        >
          <IconArrowUpRight className="h-3.5 w-3.5" />
          Open in Tab
        </a>
      </div>

      {ct.includes('pdf') ? (
        <iframe src={`${proxyUrl}#toolbar=0`} title="Certificate PDF"
          className="flex-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] min-h-[420px] lg:min-h-[700px]"
        />
      ) : ct.startsWith('image/') ? (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] overflow-hidden min-h-[420px] lg:min-h-[700px]">
          <img src={`${fileUrl}#toolbar=0`} alt="Certificate document" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] gap-4 min-h-[420px] lg:min-h-[700px]">
          <div className="h-14 w-14 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] flex items-center justify-center text-[var(--text-tertiary)]">
            <IconFiles className="h-7 w-7" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[var(--heading-color)]">Preview unavailable for this format</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Download file to view the content details.</p>
          </div>
          <a href={proxyUrl ?? ""} download
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-[var(--accent-success-strong)] text-xs font-semibold text-[var(--heading-color)] hover:bg-[var(--accent-success)] transition-all duration-300 cursor-pointer active:scale-95 glow-success mt-2"
          >
            <IconDownload className="h-4 w-4" />
            Open / Download File
          </a>
        </div>
      )}
    </>
  );
}

function EditFormFields({ fields, onChange }: {
  fields: Record<string, string>;
  onChange: (fields: Record<string, string>) => void;
}) {
  const set = (key: string, value: string) => onChange({ ...fields, [key]: value });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Supplier name" value={fields.certificateOwnerName} onChange={(v) => set("certificateOwnerName", v)} required />
      <Field label="Issuer name" value={fields.issuerName} onChange={(v) => set("issuerName", v)} required />
      <Field label="Certificate type" value={fields.certificateType} onChange={(v) => set("certificateType", v)} required />
      <Field label="Certificate number" value={fields.certificateNumber} onChange={(v) => set("certificateNumber", v)} required />
      <Field label="Year of publication" value={fields.yearOfPublication || ""} onChange={(v) => set("yearOfPublication", v)} placeholder="YYYY" />
      <div className="md:col-span-2">
        <Field label="Certificate location" value={fields.certificateLocation} onChange={(v) => set("certificateLocation", v)} placeholder="State, Country" required />
      </div>
      <Field label="Effective date (DD/MM/YYYY)" value={fields.effectiveDate} onChange={(v) => set("effectiveDate", v)} placeholder="DD/MM/YYYY" required />
      <Field label="Expiration date (DD/MM/YYYY)" value={fields.expirationDate} onChange={(v) => set("expirationDate", v)} placeholder="DD/MM/YYYY" required />
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[10px] font-semibold text-[var(--text-secondary)] block mb-1">{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        required={required}
        className="w-full px-4.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all duration-300 font-sans"
      />
    </div>
  );
}
