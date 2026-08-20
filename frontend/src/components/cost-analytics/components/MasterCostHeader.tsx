"use client";

import { IconCoin } from "@tabler/icons-react";
import type { MasterCostHeaderProps } from "../types";

export default function MasterCostHeader({
  masterMyr,
  masterUsd,
  cqData,
  chatData,
  ingestData,
}: MasterCostHeaderProps) {
  return (
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
            <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase block">
              CQ Checker
            </span>
            <span className="text-sm font-bold text-[var(--heading-color)] tabular-nums block mt-0.5">
              RM{cqData.total_cost_myr.toFixed(4)}
            </span>
          </div>
          <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center">
            <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase block">
              Chatbot
            </span>
            <span className="text-sm font-bold text-[var(--heading-color)] tabular-nums block mt-0.5">
              RM{chatData.total_cost_myr.toFixed(4)}
            </span>
          </div>
          <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center">
            <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase block">
              Ingestion
            </span>
            <span className="text-sm font-bold text-[var(--heading-color)] tabular-nums block mt-0.5">
              RM{ingestData.total_cost_myr.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
