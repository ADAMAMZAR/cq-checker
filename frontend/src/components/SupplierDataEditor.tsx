"use client";

import { useState, useCallback } from "react";
import {
  IconSearch, IconChevronLeft, IconEdit, IconFiles, IconLoader2,
  IconArrowUpRight, IconDownload, IconCircleCheck, IconAlertTriangle
} from "@tabler/icons-react";
import type { DocumentEvidence } from "@/types";
import { INITIAL_FORM_FIELDS } from "@/types";
import { updateEvidenceMetadata } from "@/lib/api";
import { cleanQuestionLabel, parseEvidenceMetadata } from "@/lib/utils";

interface SupplierDataEditorProps {
  evidenceLogs: DocumentEvidence[];
  isEvidenceLoading: boolean;
  onRefreshEvidence: () => void;
  onRefreshLogs: () => void;
}

export default function SupplierDataEditor({ evidenceLogs, isEvidenceLoading, onRefreshEvidence, onRefreshLogs }: SupplierDataEditorProps) {
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>("");
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState<DocumentEvidence | null>(null);
  const [formFields, setFormFields] = useState<Record<string, string>>({ ...INITIAL_FORM_FIELDS });
  const [initialFields, setInitialFields] = useState<Record<string, string>>({ ...INITIAL_FORM_FIELDS });
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);

  const uniqueSuppliers = Array.from(new Set(evidenceLogs.map(e => e.supplier_name)));
  const filteredSuppliers = uniqueSuppliers.filter(name =>
    name.toLowerCase().includes(supplierSearchQuery.toLowerCase())
  );
  const supplierFiles = selectedSupplierName
    ? evidenceLogs.filter(e => e.supplier_name === selectedSupplierName)
    : [];

  const handleSelectEvidence = useCallback((ev: DocumentEvidence) => {
    setSelectedEvidence(ev);
    setFormSuccessMessage(null);
    setFormErrorMessage(null);
    const fields = parseEvidenceMetadata(ev, INITIAL_FORM_FIELDS);
    setFormFields(fields);
    setInitialFields(fields);
  }, []);

  const isFormDirty = Object.keys(formFields).some(key => formFields[key] !== initialFields[key]);

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvidence) return;
    setIsSavingForm(true);
    setFormSuccessMessage(null);
    setFormErrorMessage(null);
    try {
      const responseData = await updateEvidenceMetadata(
        selectedEvidence.audit_id,
        selectedEvidence.filename,
        formFields
      );
      setFormSuccessMessage("Successfully saved changes! Comparison table recalculated.");
      setInitialFields({ ...formFields });
      await onRefreshEvidence();
      await onRefreshLogs();
      setSelectedEvidence(prev => prev ? {
        ...prev,
        gemini_extracted_supplier_name: formFields.certificateOwnerName,
        gemini_extracted_metadata: JSON.stringify(formFields)
      } : null);
    } catch (err: any) {
      setFormErrorMessage(err.message || "An unexpected error occurred while saving.");
    } finally {
      setIsSavingForm(false);
    }
  };

  if (selectedEvidence) {
    return (
      <div className="flex-1 flex flex-col gap-5 min-h-[600px]">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedEvidence(null); setFormSuccessMessage(null); setFormErrorMessage(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-visible)] text-xs text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface-hover)] transition-all duration-200 cursor-pointer active:scale-95 shrink-0"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Change Certificate
          </button>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="text-[var(--match-text)] font-semibold shrink-0">{selectedSupplierName}</span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="text-[var(--text-primary)] font-medium truncate">{selectedEvidence.filename}</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          <section className="lg:col-span-7 flex flex-col double-bezel">
            <div className="double-bezel-inner flex-1 flex flex-col h-full" style={{ minHeight: '780px' }}>
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
                    <div className="p-3 rounded-xl bg-[var(--match-bg)] border border-[var(--match-border)] text-xs text-[var(--match-text)] flex items-center gap-2 glow-success animate-fade-in">
                      <IconCircleCheck className="h-4.5 w-4.5 shrink-0" /><span>{formSuccessMessage}</span>
                    </div>
                  )}
                  {formErrorMessage && (
                    <div className="p-3 rounded-xl bg-[var(--mismatch-bg)] border border-rose-500/20 text-xs text-[var(--mismatch-text)] flex items-center gap-2 glow-error animate-fade-in">
                      <IconAlertTriangle className="h-4.5 w-4.5 shrink-0" /><span>{formErrorMessage}</span>
                    </div>
                  )}

                  <EditFormFields fields={formFields} onChange={setFormFields} />
                </div>

                <div className="mt-8 border-t border-[var(--border-subtle)] pt-4 flex justify-end">
                  <button type="submit" disabled={isSavingForm || !isFormDirty}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[var(--heading-color)] text-xs font-semibold tracking-wide transition-all duration-300 ease-out cursor-pointer active:scale-[0.97] flex items-center gap-2 glow-success disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch min-h-[600px]">
      <section className="lg:col-span-4 flex flex-col min-h-[600px] double-bezel">
        <div className="double-bezel-inner flex-1 flex flex-col h-full">
          {!selectedSupplierName ? (
            <SupplierPicker
              searchQuery={supplierSearchQuery}
              onSearchChange={setSupplierSearchQuery}
              isLoading={isEvidenceLoading}
              suppliers={filteredSuppliers}
              onSelect={(name) => { setSelectedSupplierName(name); setSelectedEvidence(null); }}
            />
          ) : (
            <SupplierFileList
              supplierName={selectedSupplierName}
              files={supplierFiles}
              selectedEvidence={selectedEvidence}
              onSelectFile={handleSelectEvidence}
              onBack={() => { setSelectedSupplierName(""); setSupplierSearchQuery(""); setSelectedEvidence(null); }}
            />
          )}
        </div>
      </section>

      <section className="lg:col-span-8 flex flex-col double-bezel">
        <div className="double-bezel-inner flex-1 flex flex-col h-full items-center justify-center text-center p-8">
          {isEvidenceLoading ? (
            <div className="w-full space-y-4 animate-pulse">
              <div className="h-14 w-14 rounded-full bg-[var(--bg-surface-hover)] mx-auto" />
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
  suppliers: string[];
  onSelect: (name: string) => void;
}) {
  return (
    <>
      <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">Supplier Registry</h3>
      <div className="relative mb-6">
        <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] h-4.5 w-4.5" />
        <input type="text" placeholder="Search supplier..." value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--match-border)] transition-all font-sans"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 max-h-[480px] pr-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] animate-pulse">
              <div className="h-4 w-3/4 bg-[var(--bg-surface-hover)] rounded mb-2"></div>
            </div>
          ))
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-tertiary)]"><p className="text-sm">No suppliers found.</p></div>
        ) : (
          suppliers.map(name => (
            <div key={name} onClick={() => onSelect(name)}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-emerald-500 hover:bg-emerald-900/10 transition-all duration-300 cursor-pointer"
            >
              <h4 className="font-semibold text-sm text-[var(--heading-color)]">{name}</h4>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function SupplierFileList({ supplierName, files, selectedEvidence, onSelectFile, onBack }: {
  supplierName: string;
  files: DocumentEvidence[];
  selectedEvidence: DocumentEvidence | null;
  onSelectFile: (ev: DocumentEvidence) => void;
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
        <h3 className="text-sm font-bold text-[var(--heading-color)] mb-1 truncate">Supplier: <span className="text-[var(--match-text)]">{supplierName}</span></h3>
        <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4 mt-2 flex items-center gap-1.5">
          <IconFiles className="h-4 w-4 text-[var(--match-text)]" />
          Available Certificates ({files.length})
        </h4>
        <div className="flex-1 overflow-y-auto space-y-3 max-h-[420px] pr-2">
          {files.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] italic">No certificates recorded for this supplier.</p>
          ) : (
            files.map(ev => {
              const isSelected = selectedEvidence?.audit_id === ev.audit_id && selectedEvidence?.filename === ev.filename;
              return (
                <div key={`${ev.audit_id}-${ev.filename}`} onClick={() => onSelectFile(ev)}
                  className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer ${isSelected
                    ? "bg-[var(--bg-surface-hover)] border-[var(--match-border)] glow-success"
                    : "bg-[var(--bg-surface)] border-[var(--border-visible)] hover:border-emerald-500 hover:bg-emerald-900/10"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <p className="text-xs font-semibold text-[var(--heading-color)] truncate pr-2">{ev.filename}</p>
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] font-medium truncate">{cleanQuestionLabel(ev.ariba_question_label)}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

function CertificateViewer({ evidence }: { evidence: DocumentEvidence }) {
  const fileUrl = evidence.file_url;
  const proxyUrl = fileUrl ? `http://127.0.0.1:8000/api/files/${btoa(fileUrl).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}` : null;
  const ct = (evidence.file_content_type || '').toLowerCase();

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] text-[var(--text-tertiary)]">
        File not available (no Supabase Storage URL)
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
          className="flex-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)]" style={{ minHeight: '700px' }}
        />
      ) : ct.startsWith('image/') ? (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] overflow-hidden" style={{ minHeight: '700px' }}>
          <img src={`${fileUrl}#toolbar=0`} alt="Certificate document" className="max-w-full max-h-full object-contain" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] gap-4" style={{ minHeight: '700px' }}>
          <div className="h-14 w-14 rounded-full bg-[var(--bg-surface)] border border-[var(--border-visible)] flex items-center justify-center text-[var(--text-tertiary)]">
            <IconFiles className="h-7 w-7" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-[var(--heading-color)]">Preview unavailable for this format</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Download file to view the content details.</p>
          </div>
          <a href={proxyUrl ?? ""} download
            className="flex items-center gap-1.5 px-4.5 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-[var(--heading-color)] hover:bg-emerald-500 transition-all duration-300 cursor-pointer active:scale-95 glow-success mt-2"
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
  return (
    <div>
      <label className="text-[10px] font-semibold text-[var(--text-secondary)] block mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        required={required}
        className="w-full px-4.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--match-border)] transition-all duration-300 font-sans"
      />
    </div>
  );
}
