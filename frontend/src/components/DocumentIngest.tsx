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
import { uploadDocument, fetchDocuments, buildFileUrl } from "@/lib/api";
import type { DocumentIngestResult, DocumentSummary } from "@/types";

const STAGES = ["Uploading", "Parsing", "Chunking", "Embedding"];

export default function DocumentIngest() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState(-1);
  const [result, setResult] = useState<DocumentIngestResult | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);
    setStage(0);
    timerRef.current = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 3500);

    try {
      const res = await uploadDocument(file, title.trim() || undefined);
      setResult(res);
      if (res.status !== "failed") await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setStage(STAGES.length);
      setFile(null);
      if (file) {
        const input = document.getElementById("ingest-file-input") as HTMLInputElement | null;
        if (input) input.value = "";
      }
    }
  };

  const statusBadge = (status?: string) => {
    switch (status) {
      case "created":
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-[var(--accent-success-soft)] text-[var(--accent-success-text)] border-[var(--accent-success-border)] inline-flex items-center gap-1">
            <IconCheck className="w-3 h-3" /> INGESTED
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
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-xl bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)]">
            <IconUpload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--heading-color)] tracking-tight">Ingest a Manual</h2>
            <p className="text-xs text-[var(--text-tertiary)]">Upload a PDF — parsed, chunked, and embedded for RAG retrieval.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label
            htmlFor="ingest-file-input"
            className={`flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
              file ? "border-[var(--accent-success-border)] bg-[var(--accent-success-soft)]" : "border-[var(--border-visible)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary-border-focus)]"
            }`}
          >
            <IconFileText className={`w-8 h-8 ${file ? "text-[var(--accent-success-text)]" : "text-[var(--text-tertiary)]"}`} />
            {file ? (
              <span className="text-sm font-semibold text-[var(--heading-color)]">{file.name}</span>
            ) : (
              <span className="text-sm text-[var(--text-secondary)]">Click to select a <span className="font-mono text-[var(--accent-primary-text)]">.pdf</span> manual</span>
            )}
            <input
              id="ingest-file-input"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title (defaults to filename)"
            aria-label="Document title"
            className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] text-sm text-[var(--heading-color)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary-border-focus)]"
          />

          <button
            type="submit"
            disabled={!file || stage >= 0 && stage < STAGES.length}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-bold text-sm transition-all shadow-md shadow-[var(--accent-primary-shadow)] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconUpload className="w-4 h-4" />
            {stage >= 0 && stage < STAGES.length ? "Ingesting…" : "Ingest Document"}
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
              Running {STAGES[stage].toLowerCase()} pipeline — large manuals take ~20–40s…
            </p>
          </div>
        )}

        {/* Result */}
        {stage === STAGES.length && result && (
          <div className="mt-6 rounded-xl border border-[var(--border-visible)] bg-[var(--bg-surface)] p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <IconFileText className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
                <span className="text-sm font-semibold text-[var(--heading-color)] truncate">{result.title}</span>
              </div>
              {statusBadge(result.status)}
            </div>
            {result.status === "failed" ? (
              <p className="text-xs text-[var(--accent-danger-text)]">{result.message || "Ingestion failed."}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Parent chunks" value={String(result.parent_count)} />
                <Stat label="Child chunks" value={String(result.child_count)} />
                <Stat label="Cost" value={`$${result.cost_usd.toFixed(6)}`} />
              </div>
            )}
            {result.message && result.status !== "failed" && (
              <p className="text-xs text-[var(--text-tertiary)]">{result.message}</p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-[var(--accent-danger-border)] bg-[var(--accent-danger-soft)] p-4 text-sm text-[var(--accent-danger-text)]">
            {error}
          </div>
        )}
      </section>

      {/* Ingested documents */}
      <section className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 shadow-xl backdrop-blur-2xl">
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
                  <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Title</th>
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Parents</th>
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Children</th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[var(--bg-surface)] transition-colors">
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
                    <td className="py-3 px-4 text-center font-mono tabular-nums">{doc.parent_count}</td>
                    <td className="py-3 px-4 text-center font-mono tabular-nums">{doc.child_count}</td>
                    <td className="py-3 px-4 text-right text-[var(--text-tertiary)]">
                      {doc.created_at ? new Date(doc.created_at).toLocaleString() : "—"}
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
