"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconUpload,
  IconFileText,
  IconCheck,
  IconX,
  IconRepeat,
  IconExternalLink,
} from "@tabler/icons-react";
import { uploadDocument, bulkUploadDocuments, fetchDocuments, buildFileUrl } from "@/lib/api";
import { formatMalaysiaDateTime } from "@/lib/dateUtils";
import type { DocumentIngestResult, DocumentSummary } from "@/types";

const STAGES = ["Uploading", "Parsing", "Chunking", "Embedding"];

export default function DocumentIngest() {
  const [files, setFiles] = useState<File[]>([]);
  const [overwrite, setOverwrite] = useState(true);
  const [stage, setStage] = useState(-1);
  const [results, setResults] = useState<DocumentIngestResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const docsFetched = useRef(false);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      setDocuments(await fetchDocuments());
    } catch {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    if (!docsFetched.current) {
      docsFetched.current = true;
      loadDocuments();
    }
  }, [loadDocuments]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setResults([]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) return;
    setError(null);
    setResults([]);
    setStage(0);
    timerRef.current = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 4500);

    try {
      const resList = await bulkUploadDocuments(files, overwrite);
      setResults(resList);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk upload failed.");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setStage(STAGES.length);
      setFiles([]);
      const input = document.getElementById("ingest-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
    }
  };

  const statusBadge = (status?: string) => {
    switch (status) {
      case "created":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-[var(--accent-success-soft)] text-[var(--accent-success-text)] border-[var(--accent-success-border)] inline-flex items-center gap-1">
            <IconCheck className="w-3 h-3" /> CREATED
          </span>
        );
      case "updated":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-blue-500/15 text-blue-400 border-blue-500/30 inline-flex items-center gap-1">
            <IconCheck className="w-3 h-3" /> OVERWRITTEN / UPDATED
          </span>
        );
      case "skipped":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-[var(--accent-warning-soft)] text-[var(--accent-warning-text)] border-[var(--accent-warning-border)] inline-flex items-center gap-1">
            <IconRepeat className="w-3 h-3" /> SKIPPED · DUPLICATE
          </span>
        );
      case "failed":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-[var(--accent-danger-soft)] text-[var(--accent-danger-text)] border-[var(--accent-danger-border)] inline-flex items-center gap-1">
            <IconX className="w-3 h-3" /> FAILED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full py-2 animate-fade-in">
      {/* Upload card */}
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]">
            <IconUpload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--heading-color)] tracking-tight">Bulk Ingest Manuals</h2>
            <p className="text-xs text-[var(--text-tertiary)]">Upload single or multiple PDF or Markdown manuals — Vision OCR for PDFs, smart Q&A chunking for Markdown, embedded for RAG retrieval.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label
            htmlFor="ingest-file-input"
            className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
              files.length > 0 ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)]" : "border-[var(--border-visible)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary-border-focus)]"
            }`}
          >
            <IconFileText className={`w-8 h-8 ${files.length > 0 ? "text-[var(--accent-success-text)]" : "text-[var(--text-tertiary)]"}`} />
            {files.length > 0 ? (
              <span className="text-sm font-semibold text-[var(--heading-color)]">
                Selected {files.length} document(s): {files.map(f => f.name).join(", ")}
              </span>
            ) : (
              <span className="text-sm text-[var(--text-secondary)]">Click to select single or multiple <span className="font-mono text-[var(--accent-primary-text)]">.pdf</span> or <span className="font-mono text-[var(--accent-primary-text)]">.md</span> manuals</span>
            )}
            <input
              id="ingest-file-input"
              type="file"
              accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />
          </label>

          {/* Overwrite Checkbox */}
          <div className="flex items-center gap-2 pt-1 px-1">
            <input
              id="overwrite-check"
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="accent-[var(--accent-primary)] w-4 h-4 cursor-pointer"
            />
            <label htmlFor="overwrite-check" className="text-xs font-semibold text-[var(--heading-color)] cursor-pointer">
              Overwrite existing documents if filename or title already exists in database
            </label>
          </div>

          <button
            type="submit"
            disabled={files.length === 0 || (stage >= 0 && stage < STAGES.length)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-bold text-sm transition-all shadow-md shadow-[var(--accent-primary-shadow)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconUpload className="w-4 h-4" />
            {stage >= 0 && stage < STAGES.length ? `Ingesting ${files.length} document(s)…` : `Ingest ${files.length > 0 ? `${files.length} Document(s)` : "Documents"}`}
          </button>
        </form>

        {/* Stage stepper */}
        {stage >= 0 && stage < STAGES.length && (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-2">
              {STAGES.map((s, i) => (
                <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className={`w-full h-1 rounded-full transition-colors ${
                      i < stage
                        ? "bg-[var(--accent-success)]"
                        : i === stage
                          ? "bg-[var(--accent-primary)] animate-pulse"
                          : "bg-[var(--border-subtle)]"
                    }`}
                  />
                  <span className={`text-[10px] font-semibold ${i === stage ? "text-[var(--accent-primary-text)]" : i < stage ? "text-[var(--accent-success-text)]" : "text-[var(--text-tertiary)]"}`}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-center text-[10px] text-[var(--text-tertiary)] mt-2 animate-pulse">
              Running bulk Vision OCR pipeline ({STAGES[stage].toLowerCase()}) — processing documents…
            </p>
          </div>
        )}

        {/* Results List */}
        {stage === STAGES.length && results.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <h4 className="text-xs font-bold text-[var(--heading-color)]">Bulk Ingestion Results ({results.length}):</h4>
            {results.map((res, i) => (
              <div key={i} className="rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <IconFileText className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-xs font-semibold text-[var(--heading-color)] truncate">{res.title}</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">({res.page_count ?? res.parent_count ?? 0} pages · ${res.cost_usd.toFixed(6)})</span>
                </div>
                {statusBadge(res.status)}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-[var(--accent-danger-border)] bg-[var(--accent-danger-soft)] p-4 text-sm text-[var(--accent-danger-text)]">
            {error}
          </div>
        )}
      </section>

      {/* Ingested documents */}
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-sm">
        <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">Ingested documents</h3>
        {loadingDocs ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-10 bg-[var(--bg-surface)] rounded-lg" />
            <div className="h-10 bg-[var(--bg-surface)] rounded-lg" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] italic">No manuals ingested yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] font-bold text-[var(--text-tertiary)]">
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px] w-12">#</th>
                  <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Title</th>
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Pages</th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {documents.map((doc, idx) => (
                  <tr key={doc.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                    <td className="py-3 px-4 text-center font-mono font-bold text-[var(--text-tertiary)] tabular-nums">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <a
                        href={buildFileUrl(doc.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-[var(--heading-color)] hover:text-[var(--accent-primary-text)] transition-colors"
                      >
                        <IconFileText className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        {doc.title}
                        <IconExternalLink className="w-3 h-3 text-[var(--text-tertiary)]" />
                      </a>
                    </td>
                    <td className="py-3 px-4 text-center font-mono tabular-nums">{doc.page_count ?? doc.parent_count ?? 0}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-tertiary)]">
                      {formatMalaysiaDateTime(doc.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] p-3 text-center">
      <span className="block text-lg font-black text-[var(--heading-color)] tabular-nums">{value}</span>
      <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-semibold">{label}</span>
    </div>
  );
}
