"use client";

import { useMemo } from "react";
import type { ChatbotCostTabProps } from "../types";
import { KpiCard, SkeletonKpiCard } from "../components/KpiCard";

export default function ChatbotCostTab({ isLoading, chatData, searchQuery }: ChatbotCostTabProps) {
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chatData.logs;
    return chatData.logs.filter((l) => l.query_text.toLowerCase().includes(q));
  }, [chatData.logs, searchQuery]);

  return (
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
            <KpiCard
              title="Chatbot Total Spend"
              value={`RM${chatData.total_cost_myr.toFixed(4)}`}
              subtitle={`$${chatData.total_cost_usd.toFixed(6)} USD`}
            />
            <KpiCard
              title="Queries Answered"
              value={`${chatData.total_queries} Prompts`}
              subtitle="Total RAG chatbot interactions"
            />
            <KpiCard
              title="Cache Hit Rate"
              value={`${chatData.cache_hit_rate_pct.toFixed(1)}%`}
              subtitle={`${chatData.cache_hits} queries served from cache`}
            />
            <KpiCard
              title="Total Tokens"
              value={`${(chatData.input_tokens + chatData.output_tokens).toLocaleString()}`}
              subtitle={`In: ${chatData.input_tokens.toLocaleString()} · Out: ${chatData.output_tokens.toLocaleString()}`}
            />
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
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">
                    Tokens (In / Out)
                  </th>
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Latency</th>
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">
                    Cache Status
                  </th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Cost (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-4">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                      <td className="py-4 px-4">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                    </tr>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[var(--text-tertiary)] italic">
                      No chatbot query logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-[var(--bg-surface)] transition-colors duration-200"
                    >
                      <td className="py-3 px-4 text-[var(--text-tertiary)] font-mono whitespace-nowrap">
                        {log.created_at}
                      </td>
                      <td
                        className="py-3 px-4 font-medium text-[var(--heading-color)] max-w-xs truncate"
                        title={log.query_text}
                      >
                        {log.query_text}
                        {log.cached_query_text && (
                          <span className="block text-[10px] text-[var(--text-tertiary)] italic truncate">
                            Matched: &ldquo;{log.cached_query_text}&rdquo;
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                        {log.input_tokens} / {log.output_tokens}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[var(--text-secondary)] tabular-nums">
                        {log.latency_ms}ms
                      </td>
                      <td className="py-3 px-4 text-center">
                        {log.cache_hit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-success-soft)] text-[var(--accent-success-text)] border border-[var(--accent-success-border)]">
                            Cache Hit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
                            AI response
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
  );
}
