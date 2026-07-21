"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type { DocumentEvidence, SupplierCost } from "@/types";
import { getSupplierCosts } from "@/lib/utils";

interface CostAnalyticsProps {
  evidenceLogs: DocumentEvidence[];
  isEvidenceLoading: boolean;
}

export default function CostAnalytics({ evidenceLogs, isEvidenceLoading }: CostAnalyticsProps) {
  const supplierCosts = getSupplierCosts(evidenceLogs);
  const totalCost = evidenceLogs.reduce((acc, ev) => {
    const costMyr = ev.cost_myr || (ev.cost_usd ? ev.cost_usd * 4.70 : 0.0);
    return acc + costMyr;
  }, 0.0);
  const avgCost = evidenceLogs.length > 0 ? totalCost / evidenceLogs.length : 0.0;

  return (
    <div className="flex-1 flex flex-col gap-8 min-h-[600px]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard title="Total API Spending" value={`RM${totalCost.toFixed(4)}`} subtitle="Accumulated sum of all runs" />
        <KpiCard title="Ingested Documents" value={`${evidenceLogs.length} Files`} subtitle="Successfully completed extractions" />
        <KpiCard title="Average Cost per Document" value={`RM${avgCost.toFixed(4)}`} />
      </div>

      <div className="double-bezel flex-1">
        <div className="double-bezel-inner h-full flex flex-col">
          <h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-6">Spend breakdown by supplier</h3>

          <div className="overflow-x-auto flex-1">
            <table className="min-w-full text-left text-xs font-sans text-[var(--text-primary)]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] font-bold text-[var(--text-tertiary)]">
                  <th className="py-3 px-4 uppercase tracking-wider text-[10px]">Supplier Name</th>
                  <th className="py-3 px-4 text-center uppercase tracking-wider text-[10px]">Certificates Audited</th>
                  <th className="py-3 px-4 text-right uppercase tracking-wider text-[10px]">Accumulated Spend (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {isEvidenceLoading ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-4 px-4"><div className="h-8 bg-[var(--bg-surface)] rounded-lg" /></td>
                      <td className="py-4 px-4 text-center"><div className="h-8 bg-[var(--bg-surface)] rounded-lg" /></td>
                      <td className="py-4 px-4 text-right"><div className="h-8 bg-[var(--bg-surface)] rounded-lg" /></td>
                    </tr>
                  ))
                ) : supplierCosts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-12 text-[var(--text-tertiary)] italic">No supplier cost metrics logged yet.</td>
                  </tr>
                ) : (
                  supplierCosts.map(sc => (
                    <tr key={sc.name} className="hover:bg-[var(--bg-surface)] transition-colors duration-300">
                      <td className="py-3 px-4 font-semibold text-[var(--heading-color)]">{sc.name}</td>
                      <td className="py-3 px-4 text-center text-[var(--text-primary)] font-medium tabular-nums">{sc.count}</td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--heading-color)] tabular-nums">RM{sc.cost.toFixed(4)}</td>
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

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="double-bezel">
      <div className="double-bezel-inner text-center py-6">
        <span className="text-[10px] uppercase font-bold text-[var(--text-tertiary)] tracking-wider block mb-1">{title}</span>
        <h3 className="text-2xl font-black text-[var(--heading-color)] tracking-tight tabular-nums">{value}</h3>
        {subtitle && <span className="text-[10px] text-[var(--text-tertiary)] mt-1 block font-medium">{subtitle}</span>}
      </div>
    </div>
  );
}
