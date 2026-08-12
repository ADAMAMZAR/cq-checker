"use client";

import { useState, useRef } from "react";
import {
  IconUpload,
  IconLoader2,
  IconFileText,
  IconCheck,
  IconAlertCircle,
  IconArrowRight,
  IconCode,
  IconEye,
  IconDeviceFloppy,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { testIngestDocument, commitIngestPages } from "@/lib/api";

interface TestPageResult {
  page_number: number;
  markdown: string;
  in_tokens: number;
  out_tokens: number;
  cost_usd: number;
  exists_in_db: boolean;
  db_content_preview?: string | null;
  committed?: boolean;
}

interface TestData {
  filename: string;
  title: string;
  total_pdf_pages: number;
  mode: "single" | "all";
  results: TestPageResult[];
  total_in_tokens: number;
  total_out_tokens: number;
  total_cost_usd: number;
}

export default function IngestTestPlayground() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"single" | "all">("single");
  const [pageNumber, setPageNumber] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Record<number, "preview" | "raw">>({});
  const [committingMap, setCommittingMap] = useState<Record<number, boolean>>({});
  const [commitAllLoading, setCommitAllLoading] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setTestData(null);
      setError(null);
    }
  };

  const handleRunTest = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setElapsed(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const data = await testIngestDocument(file, mode, pageNumber);
      setTestData(data);
      const tabs: Record<number, "preview" | "raw"> = {};
      data.results.forEach((r: TestPageResult) => {
        tabs[r.page_number] = "preview";
      });
      setActiveTab(tabs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run Vision OCR test.");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setLoading(false);
    }
  };

  const handleMarkdownChange = (pageNum: number, newMarkdown: string) => {
    setTestData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        results: prev.results.map((r) =>
          r.page_number === pageNum ? { ...r, markdown: newMarkdown, committed: false } : r
        ),
      };
    });
  };

  const handleCommitSinglePage = async (page: TestPageResult) => {
    if (!testData) return;
    setCommittingMap((prev) => ({ ...prev, [page.page_number]: true }));
    try {
      await commitIngestPages(testData.filename, testData.title, [
        { page_number: page.page_number, markdown: page.markdown },
      ]);
      setTestData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          results: prev.results.map((r) =>
            r.page_number === page.page_number ? { ...r, committed: true, exists_in_db: true } : r
          ),
        };
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setCommittingMap((prev) => ({ ...prev, [page.page_number]: false }));
    }
  };

  const handleCommitAll = async () => {
    if (!testData || !testData.results.length) return;
    setCommitAllLoading(true);
    try {
      const payload = testData.results.map((r) => ({
        page_number: r.page_number,
        markdown: r.markdown,
      }));
      await commitIngestPages(testData.filename, testData.title, payload);
      setTestData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          results: prev.results.map((r) => ({ ...r, committed: true, exists_in_db: true })),
        };
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Commit all failed.");
    } finally {
      setCommitAllLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fade-in max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] shadow-sm">
            <IconFileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-sans text-lg font-bold text-[var(--heading-color)]">
              Ingestion Testing Sandbox
            </h1>
            <p className="font-serif text-xs text-[var(--text-secondary)]">
              Test & edit Gemini 3.5 Flash Vision OCR Markdown before saving to PostgreSQL.
            </p>
          </div>
        </div>
      </div>

      {/* Controls Card */}
      <div className="p-5 rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] shadow-xs flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
          {/* File input */}
          <div className="md:col-span-5 flex flex-col gap-2">
            <label className="text-xs font-bold text-[var(--heading-color)]">Select PDF or Markdown Document</label>
            <input
              type="file"
              accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
              onChange={handleFileChange}
              className="file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[var(--accent-primary-soft)] file:text-[var(--accent-primary-text)] text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] p-2 rounded-xl border border-[var(--border-subtle)] outline-none cursor-pointer"
            />
          </div>

          {/* Mode Selector */}
          <div className="md:col-span-4 flex flex-col gap-2">
            <label className="text-xs font-bold text-[var(--heading-color)]">Ingestion Test Scope</label>
            <div className="flex items-center gap-4 h-10 px-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)]">
              <label className="flex items-center gap-1.5 text-xs text-[var(--heading-color)] cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="single"
                  checked={mode === "single"}
                  onChange={() => setMode("single")}
                  className="accent-[var(--accent-primary)]"
                />
                Single Page
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--heading-color)] cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={mode === "all"}
                  onChange={() => setMode("all")}
                  className="accent-[var(--accent-primary)]"
                />
                Whole Document
              </label>
            </div>
          </div>

          {/* Page Number input (if single) */}
          {mode === "single" && (
            <div className="md:col-span-3 flex flex-col gap-2">
              <label className="text-xs font-bold text-[var(--heading-color)]">Page Number</label>
              <input
                type="number"
                min={1}
                value={pageNumber}
                onChange={(e) => setPageNumber(parseInt(e.target.value) || 1)}
                className="h-10 px-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--heading-color)] outline-none"
              />
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <div className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
            <IconAlertCircle className="w-3.5 h-3.5" />
            Runs Gemini 3.5 Flash Vision in sandbox. <strong>Editable before committing to DB.</strong>
          </div>
          <button
            onClick={handleRunTest}
            disabled={!file || loading}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] font-semibold text-xs border border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary)] hover:text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xs"
          >
            {loading ? (
              <>
                <IconLoader2 className="w-4 h-4 animate-spin" />
                Parsing Vision OCR ({elapsed}s)…
              </>
            ) : (
              <>
                <IconUpload className="w-4 h-4" />
                Run Vision OCR Test
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <IconAlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results Section */}
      {testData && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Summary Banner */}
          <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)]">
                <IconFileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[var(--heading-color)] truncate max-w-md">
                  {testData.title}
                </h3>
                <p className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  Total PDF Pages: {testData.total_pdf_pages} · Tested: {testData.results.length} page(s)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right font-mono pr-2">
                <div className="text-xs font-bold text-[var(--heading-color)]">
                  ${testData.total_cost_usd.toFixed(6)}
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  In: {testData.total_in_tokens} t · Out: {testData.total_out_tokens} t
                </div>
              </div>

              {/* Commit All Button */}
              <button
                onClick={handleCommitAll}
                disabled={commitAllLoading}
                className="px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Commit/Overwrite all tested pages into PostgreSQL"
              >
                {commitAllLoading ? (
                  <IconLoader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <IconDeviceFloppy className="w-4 h-4" />
                    Commit All Pages ({testData.results.length})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Page Results Cards */}
          {testData.results.map((res) => {
            const isCommitted = res.committed;
            const currentTab = activeTab[res.page_number] || "preview";
            const isCommitting = committingMap[res.page_number] || false;

            return (
              <div
                key={res.page_number}
                className="rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] overflow-hidden flex flex-col shadow-sm"
              >
                {/* Card Header */}
                <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-input)] gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
                      Page {res.page_number}
                    </span>

                    {/* DB Status Badge */}
                    {isCommitted ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                        <IconCheck className="w-3 h-3" /> Committed to DB ✓
                      </span>
                    ) : res.exists_in_db ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                        Page Exists in DB (Ready to Overwrite)
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                        Draft — Not Saved Yet
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Token & Cost Info */}
                    <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                      In: {res.in_tokens} t | Out: {res.out_tokens} t | ${res.cost_usd.toFixed(6)}
                    </span>

                    {/* Preview / Raw toggle */}
                    <div className="flex items-center p-0.5 bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] text-[10px] font-bold">
                      <button
                        onClick={() =>
                          setActiveTab((prev) => ({ ...prev, [res.page_number]: "preview" }))
                        }
                        className={`px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                          currentTab === "preview"
                            ? "bg-[var(--accent-primary-soft)] text-[var(--heading-color)]"
                            : "text-[var(--text-tertiary)] hover:text-[var(--heading-color)]"
                        }`}
                      >
                        <IconEye className="w-3 h-3" /> Preview
                      </button>
                      <button
                        onClick={() =>
                          setActiveTab((prev) => ({ ...prev, [res.page_number]: "raw" }))
                        }
                        className={`px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                          currentTab === "raw"
                            ? "bg-[var(--accent-primary-soft)] text-[var(--heading-color)]"
                            : "text-[var(--text-tertiary)] hover:text-[var(--heading-color)]"
                        }`}
                      >
                        <IconCode className="w-3 h-3" /> Edit Raw Markdown
                      </button>
                    </div>

                    {/* OVERWRITE / COMMIT BUTTON WITH ARROW */}
                    <button
                      onClick={() => handleCommitSinglePage(res)}
                      disabled={isCommitting || isCommitted}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                        isCommitted
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
                          : "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] hover:bg-[var(--accent-primary)] hover:text-white"
                      }`}
                      title={res.exists_in_db ? "Overwrite page in DB" : "Save page to DB"}
                    >
                      {isCommitting ? (
                        <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isCommitted ? (
                        <>
                          <IconCheck className="w-3.5 h-3.5" /> Saved
                        </>
                      ) : (
                        <>
                          <span>{res.exists_in_db ? "Overwrite DB Page" : "Save Page to DB"}</span>
                          <IconArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 overflow-auto max-h-[550px] bg-[var(--bg-card)]">
                  {currentTab === "preview" ? (
                    <div className="prose prose-invert max-w-none text-xs leading-relaxed font-sans text-[var(--text-primary)]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {res.markdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-bold text-[var(--accent-primary-text)]">
                        Edit Markdown (Live Preview updates automatically):
                      </label>
                      <textarea
                        value={res.markdown}
                        onChange={(e) => handleMarkdownChange(res.page_number, e.target.value)}
                        rows={14}
                        className="w-full font-mono text-xs text-[var(--heading-color)] bg-[var(--bg-input)] p-4 rounded-xl border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent-primary-border-focus)] leading-relaxed resize-y"
                        placeholder="Type or paste Markdown text..."
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
