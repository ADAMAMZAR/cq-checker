"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  IconFileCheck,
  IconRobot,
  IconFileUpload,
  IconSparkles,
  IconBolt,
  IconCoin,
  IconSearch,
  IconCircleCheck,
} from "@tabler/icons-react";
import type { CostAnalyticsData } from "@/types";
import { fetchCostAnalytics } from "@/lib/api";

type CostSubTab = "cq" | "chatbot" | "ingestion";

export default function CostAnalytics() {
  const [data, setData] = useState<CostAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CostSubTab>("cq");
  const [searchQuery, setSearchQuery] = useState("");
  const costAnalyticsFetched = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchCostAnalytics();
      setData(result);
    } catch (err) {
      console.error("Failed to load cost analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!costAnalyticsFetched.current) {
      costAnalyticsFetched.current = true;
      load();
    }
  }, [load]);

  const cqData = data?.cq_checker || {
    total_cost_usd: 0,
    total_cost_myr: data?.total_cost_myr ?? 0,
    total_documents: data?.total_documents ?? 0,
    average_cost_myr: data?.average_cost_myr ?? 0,
    breakdown: data?.breakdown ?? [],
  };

  const chatData = data?.chatbot || {
    total_cost_usd: 0,
    total_cost_myr: 0,
    total_queries: 0,
    cache_hits: 0,
    cache_hit_rate_pct: 0,
    input_tokens: 0,
    output_tokens: 0,
    logs: [],
  };

  const ingestData = data?.ingestion || {
    total_cost_usd: 0,
    total_cost_myr: 0,
    total_documents: 0,
    total_pages: 0,
    input_tokens: 0,
    output_tokens: 0,
    documents: [],
  };

  const masterMyr = data?.master_cost_myr ?? (cqData.total_cost_myr + chatData.total_cost_myr + ingestData.total_cost_myr);
  const masterUsd = data?.master_cost_usd ?? (cqData.total_cost_usd + chatData.total_cost_usd + ingestData.total_cost_usd);

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-[600px] animate-fade-in">
      {/* ── Top Master System Cost Card ── */}
      <div className="double-bezel bg-[var(--bg-card)]">
        <div className="double-bezel-inner p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
                <IconCoin className="w-4 h-4" />
              </span>
              <span className="text-xs uppercase font-bold text-[var(--text-tertiary)] tracking-wider">
                System-Wide Master API Expenditure
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-3xl font-black text-[var(--heading-color)] tracking-tight tabular-nums">
                RM{masterMyr.toFixed(4)}
              </h2>
              <span className="text-sm font-semibold text-[var(--text-tertiary)] font-mono">
                (${masterUsd.toFixed(6)} USD)
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Combined API spending across Supplier Auditing, RAG Chatbot, and Multimodal OCR Ingestion.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 w-full md:w-auto shrink-0">
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center">
              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase block">CQ Checker</span>
              <span className="text-sm font-bold text-[var(--heading-color)] tabular-nums block mt-0.5">RM{cqData.total_cost_myr.toFixed(4)}</span>
            </div>
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center">
              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase block">Chatbot</span>
              <span className="text-sm font-bold text-[var(--heading-color)] tabular-nums block mt-0.5">RM{chatData.total_cost_myr.toFixed(4)}</span>
            </div>
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center">
              <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase block">Ingestion</span>
              <span className="text-sm font-bold text-[var(--heading-color)] tabular-nums block mt-0.5">RM{ingestData.total_cost_myr.toFixed(4)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ── */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setActiveTab("cq")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "cq"
              ? "bg-[var(--accent-primary-soft)] text-[var(--heading-color)] border border-[var(--accent-primary-border)] shadow-xs"
              : "text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface)] border border-transparent"
          }`}
        >
          <IconFileCheck className="w-4 h-4 text-[var(--accent-primary-text)]" />
          <span>CQ Checker (Audits)</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-tertiary)]">
            RM{cqData.total_cost_myr.toFixed(4)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("chatbot")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "chatbot"
              ? "bg-[var(--accent-primary-soft)] text-[var(--heading-color)] border border-[var(--accent-primary-border)] shadow-xs"
              : "text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface)] border border-transparent"
          }`}
        >
          <IconRobot className="w-4 h-4 text-[var(--accent-primary-text)]" />
          <span>Chatbot RAG</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-tertiary)]">
            RM{chatData.total_cost_myr.toFixed(4)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ingestion")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "ingestion"
              ? "bg-[var(--accent-primary-soft)] text-[var(--heading-color)] border border-[var(--accent-primary-border)] shadow-xs"
              : "text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-surface)] border border-transparent"
          }`}
        >
          <IconFileUpload className="w-4 h-4 text-[var(--accent-primary-text)]" />
          <span>Document Ingestion</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-tertiary)]">
            RM{ingestData.total_cost_myr.toFixed(4)}
          </span>
        </button>
      </div>

      {/* ── Search filter for tables ── */}
      <div className="relative">
        <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${activeTab === "cq" ? "suppliers" : activeTab === "chatbot" ? "chat prompts" : "documents"}…`}
          className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-[var(--bg-card)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary-border)] text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none transition-all"
        />
      </div>

      {/* ── Tab 1: CQ Checker Audits Breakdown ── */}
      {activeTab === "cq" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isLoading ? (
              <>
                <SkeletonKpiCard />
                <SkeletonKpiCard />
                <SkeletonKpiCard />
              </>
            ) : (
              <>
                <KpiCard title="CQ Audits Spend" value={`RM${cqData.total_cost_myr.toFixed(4)}`} subtitle={`$${cqData.total_cost_usd.toFixed(6)} USD`} />
                <KpiCard title="Audited Certificates" value={`${cqData.total_documents} Files`} subtitle="Completed supplier evidence checks" />
                <KpiCard title="Avg Cost per Cert" value={`RM${cqData.average_cost_myr.toFixed(4)}`} subtitle="Per certificate extraction + audit" />
              </>
            )}
          </div>

          <div className="double-bezel flex-1">
            <div className="double-bezel-inner h-full flex flex-col">
              <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
                Spend Breakdown by Supplier
              </h3>
              <div className="overflow-x-auto flex-1">
                <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] font-bold text-[var(--text-tertiary)]">
                      <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Supplier Name</th>
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Certificates Audited</th>
                      <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Accumulated Spend (USD)</th>
                      <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Accumulated Spend (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <tr key={idx} className="animate-pulse">
                          <td className="py-4 px-4"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-center"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-right"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-right"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                        </tr>
                      ))
                    ) : cqData.breakdown.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-[var(--text-tertiary)] italic">No supplier audit cost metrics logged yet.</td>
                      </tr>
                    ) : (
                      cqData.breakdown
                        .filter(item => item.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(item => (
                          <tr key={item.supplier_name} className="hover:bg-[var(--bg-surface)] transition-colors duration-200">
                            <td className="py-3 px-4 font-semibold text-[var(--heading-color)]">{item.supplier_name}</td>
                            <td className="py-3 px-4 text-center text-[var(--text-primary)] font-medium tabular-nums">{item.document_count}</td>
                            <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] tabular-nums">${(item.cost_usd ?? 0).toFixed(6)}</td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--heading-color)] tabular-nums">RM{item.cost_myr.toFixed(4)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: Chatbot RAG Breakdown ── */}
      {activeTab === "chatbot" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {isLoading ? (
              <>
                <SkeletonKpiCard />
                <SkeletonKpiCard />
                <SkeletonKpiCard />
                <SkeletonKpiCard />
              </>
            ) : (
              <>
                <KpiCard title="Chatbot Total Spend" value={`RM${chatData.total_cost_myr.toFixed(4)}`} subtitle={`$${chatData.total_cost_usd.toFixed(6)} USD`} />
                <KpiCard title="Queries Answered" value={`${chatData.total_queries} Prompts`} subtitle="Total RAG chatbot interactions" />
                <KpiCard title="Cache Hit Rate" value={`${chatData.cache_hit_rate_pct.toFixed(1)}%`} subtitle={`${chatData.cache_hits} queries served from cache`} />
                <KpiCard title="Total Tokens" value={`${(chatData.input_tokens + chatData.output_tokens).toLocaleString()}`} subtitle={`In: ${chatData.input_tokens.toLocaleString()} · Out: ${chatData.output_tokens.toLocaleString()}`} />
              </>
            )}
          </div>

          <div className="double-bezel flex-1">
            <div className="double-bezel-inner h-full flex flex-col">
              <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
                Chatbot Query Logs & Token Usage
              </h3>
              <div className="overflow-x-auto flex-1">
                <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] font-bold text-[var(--text-tertiary)]">
                      <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Timestamp</th>
                      <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Query Prompt</th>
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Tokens (In / Out)</th>
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Latency</th>
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Cache Status</th>
                      <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Cost (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <tr key={idx} className="animate-pulse">
                          <td className="py-4 px-4"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-center"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-center"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-center"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-right"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                        </tr>
                      ))
                    ) : chatData.logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-[var(--text-tertiary)] italic">No chatbot query logs recorded yet.</td>
                      </tr>
                    ) : (
                      chatData.logs
                        .filter(l => l.query_text.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(log => (
                          <tr key={log.id} className="hover:bg-[var(--bg-surface)] transition-colors duration-200">
                            <td className="py-3 px-4 text-[var(--text-tertiary)] font-mono whitespace-nowrap">{log.created_at}</td>
                            <td className="py-3 px-4 font-medium text-[var(--heading-color)] max-w-xs truncate" title={log.query_text}>
                              {log.query_text}
                              {log.cached_query_text && (
                                <span className="block text-[10px] text-[var(--text-tertiary)] italic truncate">
                                  Matched: "{log.cached_query_text}"
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                              {log.input_tokens} / {log.output_tokens}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-[var(--text-secondary)] tabular-nums">{log.latency_ms}ms</td>
                            <td className="py-3 px-4 text-center">
                              {log.cache_hit ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-success-soft)] text-[var(--accent-success-text)] border border-[var(--accent-success-border)]">
                                  <IconCircleCheck className="w-3 h-3" /> Cache Hit
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
                                  <IconSparkles className="w-3 h-3" /> Gemini LLM
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--heading-color)] tabular-nums">
                              RM{log.cost_myr.toFixed(4)}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 3: Document Ingestion Breakdown ── */}
      {activeTab === "ingestion" && (
        <div className="flex flex-col gap-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {isLoading ? (
              <>
                <SkeletonKpiCard />
                <SkeletonKpiCard />
                <SkeletonKpiCard />
                <SkeletonKpiCard />
              </>
            ) : (
              <>
                <KpiCard title="Ingestion Spend" value={`RM${ingestData.total_cost_myr.toFixed(4)}`} subtitle={`$${ingestData.total_cost_usd.toFixed(6)} USD`} />
                <KpiCard title="Ingested Documents" value={`${ingestData.total_documents} Manuals`} subtitle="Parsed & indexed into RAG vector store" />
                <KpiCard title="Indexed Pages" value={`${ingestData.total_pages} Pages`} subtitle="Extracted with Gemini Vision OCR" />
                <KpiCard title="Ingestion Tokens" value={`${(ingestData.input_tokens + ingestData.output_tokens).toLocaleString()}`} subtitle={`In: ${ingestData.input_tokens.toLocaleString()} · Out: ${ingestData.output_tokens.toLocaleString()}`} />
              </>
            )}
          </div>

          <div className="double-bezel flex-1">
            <div className="double-bezel-inner h-full flex flex-col">
              <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
                Ingested Manuals & OCR Expenditure
              </h3>
              <div className="overflow-x-auto flex-1">
                <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] font-bold text-[var(--text-tertiary)]">
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px] w-12">#</th>
                      <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Document Title</th>
                      <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Ingested At</th>
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Pages</th>
                      <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Tokens (Prompt / Candidate)</th>
                      <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Cost (USD)</th>
                      <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Cost (RM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <tr key={idx} className="animate-pulse">
                          <td className="py-4 px-4 text-center"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-center"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-center"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-right"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                          <td className="py-4 px-4 text-right"><div className="h-6 bg-[var(--bg-surface)] rounded-lg" /></td>
                        </tr>
                      ))
                    ) : ingestData.documents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-[var(--text-tertiary)] italic">No ingested document cost logs recorded yet.</td>
                      </tr>
                    ) : (
                      ingestData.documents
                        .filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((doc, idx) => (
                          <tr key={doc.id} className="hover:bg-[var(--bg-surface)] transition-colors duration-200">
                            <td className="py-3 px-4 text-center font-mono font-bold text-[var(--text-tertiary)] tabular-nums">{idx + 1}</td>
                            <td className="py-3 px-4 font-semibold text-[var(--heading-color)] max-w-sm truncate" title={doc.title}>
                              {doc.title}
                            </td>
                            <td className="py-3 px-4 text-[var(--text-tertiary)] font-mono whitespace-nowrap">{doc.created_at}</td>
                            <td className="py-3 px-4 text-center text-[var(--text-primary)] font-medium tabular-nums">{doc.page_count}</td>
                            <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                              {doc.input_tokens} / {doc.output_tokens}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] tabular-nums">${doc.cost_usd.toFixed(6)}</td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--heading-color)] tabular-nums">RM{doc.cost_myr.toFixed(4)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="double-bezel">
      <div className="double-bezel-inner text-center py-5 px-4">
        <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider block mb-1">{title}</span>
        <h3 className="text-2xl font-black text-[var(--heading-color)] tracking-tight tabular-nums">{value}</h3>
        {subtitle && <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block font-medium">{subtitle}</span>}
      </div>
    </div>
  );
}

function SkeletonKpiCard() {
  return (
    <div className="double-bezel animate-pulse">
      <div className="double-bezel-inner text-center py-5 px-4 space-y-2">
        <div className="h-3 w-28 bg-[var(--bg-surface-hover)] rounded mx-auto" />
        <div className="h-7 w-32 bg-[var(--bg-surface-hover)] rounded-lg mx-auto" />
        <div className="h-3 w-36 bg-[var(--bg-surface-hover)] rounded mx-auto" />
      </div>
    </div>
  );
}
