"use client";

import { useMemo } from "react";
import type { CqCostTabProps } from "../types";
import { KpiCard, SkeletonKpiCard } from "../components/KpiCard";

export default function CqCostTab({ isLoading, cqData, searchQuery }: CqCostTabProps) {
  const filteredBreakdown = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cqData.breakdown;
    return cqData.breakdown.filter((item) =>
      item.supplier_name.toLowerCase().includes(q)
    );
  }, [cqData.breakdown, searchQuery]);

  return (
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
            <KpiCard
              title="CQ Audits Spend"
              value={`RM${cqData.total_cost_myr.toFixed(4)}`}
              subtitle={`$${cqData.total_cost_usd.toFixed(6)} USD`}
            />
            <KpiCard
              title="Audited Certificates"
              value={`${cqData.total_documents} Files`}
              subtitle="Completed supplier evidence checks"
            />
            <KpiCard
              title="Avg Cost per Cert"
              value={`RM${cqData.average_cost_myr.toFixed(4)}`}
              subtitle="Per certificate extraction + audit"
            />
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
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">
                    Certificates Audited
                  </th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">
                    Accumulated Spend (USD)
                  </th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">
                    Accumulated Spend (RM)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-4">
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
                ) : filteredBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-[var(--text-tertiary)] italic">
                      No supplier audit cost metrics logged yet.
                    </td>
                  </tr>
                ) : (
                  filteredBreakdown.map((item) => (
                    <tr
                      key={item.supplier_name}
                      className="hover:bg-[var(--bg-surface)] transition-colors duration-200"
                    >
                      <td className="py-3 px-4 font-semibold text-[var(--heading-color)]">
                        {item.supplier_name}
                      </td>
                      <td className="py-3 px-4 text-center text-[var(--text-primary)] font-medium tabular-nums">
                        {item.document_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                        ${(item.cost_usd ?? 0).toFixed(6)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--heading-color)] tabular-nums">
                        RM{item.cost_myr.toFixed(4)}
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
