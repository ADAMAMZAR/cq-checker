"use client";

import { useMemo } from "react";
import type { IngestionCostTabProps } from "../types";
import { KpiCard, SkeletonKpiCard } from "../components/KpiCard";
import { formatMalaysiaDateTime } from "@/lib/dateUtils";

export default function IngestionCostTab({ isLoading, ingestData, searchQuery }: IngestionCostTabProps) {
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ingestData.documents;
    return ingestData.documents.filter((d) => d.title.toLowerCase().includes(q));
  }, [ingestData.documents, searchQuery]);

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
              title="Ingestion Spend"
              value={`RM${ingestData.total_cost_myr.toFixed(4)}`}
              subtitle={`$${ingestData.total_cost_usd.toFixed(6)} USD`}
            />
            <KpiCard
              title="Ingested Documents"
              value={`${ingestData.total_documents} Manuals`}
              subtitle="Parsed & indexed into RAG vector store"
            />
            <KpiCard
              title="Indexed Pages"
              value={`${ingestData.total_pages} Pages`}
              subtitle="Extracted with Gemini Vision OCR"
            />
            <KpiCard
              title="Ingestion Tokens"
              value={`${(ingestData.input_tokens + ingestData.output_tokens).toLocaleString()}`}
              subtitle={`In: ${ingestData.input_tokens.toLocaleString()} · Out: ${ingestData.output_tokens.toLocaleString()}`}
            />
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
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">
                    Tokens (Prompt / Candidate)
                  </th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Cost (USD)</th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Cost (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-4 text-center">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
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
                      <td className="py-4 px-4 text-right">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="h-6 bg-[var(--bg-surface)] rounded-lg" />
                      </td>
                    </tr>
                  ))
                ) : filteredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-[var(--text-tertiary)] italic">
                      No ingested document cost logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredDocuments.map((doc, idx) => (
                    <tr key={doc.id} className="hover:bg-[var(--bg-surface)] transition-colors duration-200">
                      <td className="py-3 px-4 text-center font-mono font-bold text-[var(--text-tertiary)] tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[var(--heading-color)] max-w-sm truncate" title={doc.title}>
                        {doc.title}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-tertiary)] font-mono whitespace-nowrap">
                        {formatMalaysiaDateTime(doc.created_at)}
                      </td>
                      <td className="py-3 px-4 text-center text-[var(--text-primary)] font-medium tabular-nums">
                        {doc.page_count}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums text-[var(--text-secondary)]">
                        {doc.input_tokens} / {doc.output_tokens}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                        ${doc.cost_usd.toFixed(6)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--heading-color)] tabular-nums">
                        RM{doc.cost_myr.toFixed(4)}
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
