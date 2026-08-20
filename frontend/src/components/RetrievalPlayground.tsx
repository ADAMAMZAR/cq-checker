"use client";

import { useState } from "react";
import {
  IconSearch,
  IconAdjustmentsHorizontal,
  IconFileText,
  IconExternalLink,
  IconLoader2,
  IconCheck,
  IconCopy,
  IconBulb,
  IconChevronDown,
  IconChevronRight,
  IconSparkles,
} from "@tabler/icons-react";
import { testRetrieval, buildFileUrl } from "@/lib/api";

const PRESET_QUERIES = [
  "What is the ceiling price for auctions?",
  "How to onboard a non-Ariba vendor?",
  "RM100,000 threshold payment policy",
  "Supplier registration questionnaire steps",
  "Taiwan tax ID requirements",
];

export default function RetrievalPlayground() {
  const [query, setQuery] = useState("");
  const [k, setK] = useState(5);
  const [windowSize, setWindowSize] = useState(4);
  const [vectorWeight, setVectorWeight] = useState(0.6);
  const [bm25Weight, setBm25Weight] = useState(0.4);
  const [regionFilter, setRegionFilter] = useState("AUTO");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [expandedChunk, setExpandedChunk] = useState<number | null>(0);

  const handleTest = async (testQuery?: string) => {
    const q = testQuery ?? query;
    if (!q.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await testRetrieval({
        query: q,
        k,
        window_size: windowSize,
        vector_weight: vectorWeight,
        bm25_weight: bm25Weight,
        region_filter: regionFilter,
      });
      setTestResult(res);
      setExpandedChunk(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run retrieval test.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent-primary-text)] uppercase tracking-wider mb-1">
            <IconSparkles className="w-4 h-4 text-[var(--accent-primary-text)]" />
            <span>PostgreSQL Vector & Keyword RAG Sandbox</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-[var(--heading-color)]">
            PostgreSQL Retrieval & Chunk Playground
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
            Test vector similarity scores vs BM25 keyword rankings, inspect retrieved sub-workflow page windows, and debug why specific document passages are selected.
          </p>
        </div>
      </div>

      {/* Main Grid: Controls + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Query Input & Tuning Sliders (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Query Box */}
          <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] shadow-md flex flex-col gap-4">
            <h3 className="text-sm font-bold text-[var(--heading-color)] flex items-center gap-2">
              <IconSearch className="w-4 h-4 text-[var(--accent-primary-text)]" />
              1. Search Query
            </h3>

            <div className="flex flex-col gap-2">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTest();
                  }
                }}
                placeholder="Enter search query or procurement question..."
                className="w-full h-24 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary-border)] text-xs text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none resize-none leading-relaxed transition-all"
              />

              <button
                type="button"
                onClick={() => handleTest()}
                disabled={loading || !query.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--accent-primary)] hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <IconLoader2 className="w-4 h-4 animate-spin" />
                    <span>Searching PostgreSQL...</span>
                  </>
                ) : (
                  <>
                    <IconSearch className="w-4 h-4" />
                    <span>Run Retrieval Test</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Test Presets */}
            <div className="pt-3 border-t border-[var(--border-subtle)]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1 mb-2">
                <IconBulb className="w-3 h-3 text-[var(--accent-warning)]" />
                Quick Test Queries:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_QUERIES.map((pq, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQuery(pq);
                      handleTest(pq);
                    }}
                    className="text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--accent-primary-soft)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--heading-color)] transition-all cursor-pointer text-left"
                  >
                    {pq}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Parameters Box */}
          <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] shadow-md flex flex-col gap-4">
            <h3 className="text-sm font-bold text-[var(--heading-color)] flex items-center gap-2">
              <IconAdjustmentsHorizontal className="w-4 h-4 text-[var(--accent-primary-text)]" />
              2. Retrieval Tuning Parameters
            </h3>

            {/* Region Filter */}
            <div className="flex flex-col gap-1.5 pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--heading-color)]">Region Document Isolation:</span>
              </div>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--heading-color)] outline-none cursor-pointer focus:border-[var(--accent-primary-border)]"
              >
                <option value="AUTO">⚡ Auto Detect (from query intent)</option>
                <option value="VN">🇻🇳 Vietnam (VN + General)</option>
                <option value="TW">🇹🇼 Taiwan (TW + General)</option>
                <option value="MY">🇲🇾 Malaysia (MY + General)</option>
                <option value="AU">🇦🇺 Australia (AU + General)</option>
                <option value="GENERAL">🌐 General / Global Only</option>
                <option value="ALL">🔍 All Documents (No Filter)</option>
              </select>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                Isolates search to region-specific manuals + global manuals to prevent document contamination.
              </span>
            </div>

            {/* Top-K Seed Hits */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--heading-color)]">Top-K Seed Matches:</span>
                <span className="font-mono font-bold text-[var(--accent-primary-text)]">{k} pages</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={k}
                onChange={(e) => setK(Number(e.target.value))}
                className="w-full accent-[var(--accent-primary)] cursor-pointer"
              />
              <span className="text-[10px] text-[var(--text-tertiary)]">
                Number of top seed matching document pages retrieved from database before window expansion.
              </span>
            </div>

            {/* Sub-Workflow Window Size */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--heading-color)]">Sub-Workflow Window:</span>
                <span className="font-mono font-bold text-[var(--accent-primary-text)]">+{windowSize} pages</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={windowSize}
                onChange={(e) => setWindowSize(Number(e.target.value))}
                className="w-full accent-[var(--accent-primary)] cursor-pointer"
              />
              <span className="text-[10px] text-[var(--text-tertiary)]">
                Fetches forward adjacent pages to construct contiguous multi-page procedure context.
              </span>
            </div>

            {/* Vector Weight */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--heading-color)]">Vector Weight:</span>
                <span className="font-mono font-bold text-[var(--accent-primary-text)]">{vectorWeight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={vectorWeight}
                onChange={(e) => setVectorWeight(Number(e.target.value))}
                className="w-full accent-[var(--accent-primary)] cursor-pointer"
              />
              <span className="text-[10px] text-[var(--text-tertiary)]">
                PGVector Cosine Embedding similarity weight (conceptual matching).
              </span>
            </div>

            {/* BM25 Weight */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--heading-color)]">BM25 Keyword Weight:</span>
                <span className="font-mono font-bold text-[var(--accent-primary-text)]">{bm25Weight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={bm25Weight}
                onChange={(e) => setBm25Weight(Number(e.target.value))}
                className="w-full accent-[var(--accent-primary)] cursor-pointer"
              />
              <span className="text-[10px] text-[var(--text-tertiary)]">
                PostgreSQL Full-Text Search ts_rank_cd keyword weight (exact term matching).
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Retrieval Results & Analysis (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
              ⚠️ {error}
            </div>
          )}

          {!testResult && !loading && (
            <div className="p-12 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] text-center flex flex-col items-center justify-center gap-3">
              <div className="p-4 rounded-2xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)]">
                <IconSearch className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-[var(--heading-color)]">
                Ready to Test PostgreSQL Retrieval
              </h4>
              <p className="text-xs text-[var(--text-tertiary)] max-w-md">
                Type a query on the left or click a preset test query to inspect retrieved PostgreSQL passages, vector vs keyword scores, and window ranges.
              </p>
            </div>
          )}

          {loading && (
            <div className="p-12 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] text-center flex flex-col items-center justify-center gap-3">
              <IconLoader2 className="w-8 h-8 animate-spin text-[var(--accent-primary-text)]" />
              <p className="text-xs font-semibold text-[var(--heading-color)]">
                Running PGVector + BM25 Hybrid Retrieval...
              </p>
            </div>
          )}

          {testResult && !loading && (
            <div className="flex flex-col gap-4">
              {/* Summary Bar */}
              <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-[var(--heading-color)]">
                    Retrieved <span className="text-[var(--accent-primary-text)] font-bold">{testResult.results.length}</span> Unique Windows ({testResult.seed_hits_count} seed hits)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[var(--bg-input)] text-[10px] font-mono text-[var(--text-tertiary)]">
                    ⏱️ {testResult.latency_ms} ms
                  </span>
                  {testResult.detected_region && (
                    <span className="px-2 py-0.5 rounded bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] text-[10px] font-mono font-bold flex items-center gap-1">
                      <span>Target Region: {testResult.detected_region}</span>
                      {testResult.output_lang_name && <span className="opacity-75">({testResult.output_lang_name})</span>}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
                  <span>Formula: </span>
                  <span className="font-mono bg-[var(--bg-input)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                    ({vectorWeight} × Vector) + ({bm25Weight} × BM25)
                  </span>
                </div>
              </div>

              {/* Chunk Cards */}
              <div className="space-y-3">
                {testResult.results.map((res: any, idx: number) => {
                  const isExpanded = expandedChunk === idx;
                  const pdfUrl = buildFileUrl(res.file_url);

                  return (
                    <div
                      key={idx}
                      className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] overflow-hidden transition-all shadow-md"
                    >
                      {/* Header Row */}
                      <div
                        onClick={() => setExpandedChunk(isExpanded ? null : idx)}
                        className="p-4 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] cursor-pointer flex items-center justify-between gap-3 select-none"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-[var(--accent-primary-soft)] border border-[var(--accent-primary-border)] text-[var(--accent-primary-text)] text-xs font-bold flex items-center justify-center shrink-0">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-[var(--heading-color)] truncate flex items-center gap-2">
                              {res.region && (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 ${
                                  res.region === "VN" ? "bg-red-500/10 text-red-400 border border-red-500/30" :
                                  res.region === "TW" ? "bg-blue-500/10 text-blue-400 border border-blue-500/30" :
                                  res.region === "MY" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                                  res.region === "AU" ? "bg-purple-500/10 text-purple-400 border border-purple-500/30" :
                                  "bg-gray-500/10 text-gray-400 border border-gray-500/30"
                                }`}>
                                  {res.region === "VN" ? "🇻🇳 VN" : res.region === "TW" ? "🇹🇼 TW" : res.region === "MY" ? "🇲🇾 MY" : res.region === "AU" ? "🇦🇺 AU" : "🌐 GLOBAL"}
                                </span>
                              )}
                              <span className="truncate">{res.title}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--bg-input)] text-[var(--accent-primary-text)] border border-[var(--border-subtle)] shrink-0">
                                pages {res.page_number_start}-{res.page_number_end}
                              </span>
                            </h4>
                            <p className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5">
                              {res.seed_pages && res.seed_pages.length > 1
                                ? `Merged Seed Pages #${res.seed_pages.join(", #")} hits`
                                : `Seed Page #${res.page_number} hit`}
                            </p>
                          </div>
                        </div>

                        {/* Scores & Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1.5 font-mono text-[10px]">
                            <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold" title="Combined Hybrid Score">
                              Combined: {res.combined_score}
                            </span>
                            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-secondary)]" title="Vector Cosine Similarity">
                              Vec: {res.vector_similarity}
                            </span>
                            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-secondary)]" title="BM25 Keyword Rank">
                              BM25: {res.bm25_rank}
                            </span>
                          </div>

                          {pdfUrl && (
                            <a
                              href={pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--accent-primary-soft)] text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] border border-[var(--border-subtle)] transition-all cursor-pointer"
                              title="Open original document PDF"
                            >
                              <IconExternalLink className="w-4 h-4" />
                            </a>
                          )}

                          {isExpanded ? (
                            <IconChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />
                          ) : (
                            <IconChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Content View */}
                      {isExpanded && (
                        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-input)]/50 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                              Full Windowed Text (Pages {res.page_number_start} to {res.page_number_end}):
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyText(res.window_content, idx)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--heading-color)] cursor-pointer"
                            >
                              {copiedIdx === idx ? (
                                <>
                                  <IconCheck className="w-3 h-3 text-[var(--accent-success)]" />
                                  <span className="text-[var(--accent-success)]">Copied</span>
                                </>
                              ) : (
                                <>
                                  <IconCopy className="w-3 h-3" />
                                  <span>Copy Text</span>
                                </>
                              )}
                            </button>
                          </div>

                          <pre className="whitespace-pre-wrap break-words text-xs text-[var(--text-primary)] font-sans leading-relaxed p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] max-h-96 overflow-y-auto font-mono text-[11px]">
                            {res.window_content}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
