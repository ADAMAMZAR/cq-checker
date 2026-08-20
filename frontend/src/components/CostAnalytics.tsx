"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  IconFileCheck,
  IconRobot,
  IconFileUpload,
  IconSearch,
} from "@tabler/icons-react";
import type { CostAnalyticsData } from "@/types";
import { fetchCostAnalytics } from "@/lib/api";

import type { CostSubTab } from "./cost-analytics/types";
import MasterCostHeader from "./cost-analytics/components/MasterCostHeader";
import CqCostTab from "./cost-analytics/tabs/CqCostTab";
import ChatbotCostTab from "./cost-analytics/tabs/ChatbotCostTab";
import IngestionCostTab from "./cost-analytics/tabs/IngestionCostTab";

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
    } catch (err: unknown) {
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

  // Normalized data memoization to avoid object re-allocations during re-renders
  const { cqData, chatData, ingestData, masterMyr, masterUsd } = useMemo(() => {
    const cq = data?.cq_checker || {
      total_cost_usd: 0,
      total_cost_myr: data?.total_cost_myr ?? 0,
      total_documents: data?.total_documents ?? 0,
      average_cost_myr: data?.average_cost_myr ?? 0,
      breakdown: data?.breakdown ?? [],
    };

    const chat = data?.chatbot || {
      total_cost_usd: 0,
      total_cost_myr: 0,
      total_queries: 0,
      cache_hits: 0,
      cache_hit_rate_pct: 0,
      input_tokens: 0,
      output_tokens: 0,
      logs: [],
    };

    const ingest = data?.ingestion || {
      total_cost_usd: 0,
      total_cost_myr: 0,
      total_documents: 0,
      total_pages: 0,
      input_tokens: 0,
      output_tokens: 0,
      documents: [],
    };

    const myr =
      data?.master_cost_myr ?? (cq.total_cost_myr + chat.total_cost_myr + ingest.total_cost_myr);
    const usd =
      data?.master_cost_usd ?? (cq.total_cost_usd + chat.total_cost_usd + ingest.total_cost_usd);

    return {
      cqData: cq,
      chatData: chat,
      ingestData: ingest,
      masterMyr: myr,
      masterUsd: usd,
    };
  }, [data]);

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-[600px] animate-fade-in">
      {/* Top Master System Cost Card */}
      <MasterCostHeader
        masterMyr={masterMyr}
        masterUsd={masterUsd}
        cqData={cqData}
        chatData={chatData}
        ingestData={ingestData}
      />

      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setActiveTab("cq")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "cq"
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
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "chatbot"
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
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "ingestion"
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

      {/* Search Filter Input */}
      <div className="relative">
        <IconSearch className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${activeTab === "cq"
              ? "suppliers"
              : activeTab === "chatbot"
                ? "chat prompts"
                : "documents"
            }…`}
          className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-[var(--bg-card)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary-border)] text-[var(--heading-color)] placeholder-[var(--text-tertiary)] outline-none transition-all"
        />
      </div>

      {/* Active Tab Panel */}
      {activeTab === "cq" && (
        <CqCostTab isLoading={isLoading} cqData={cqData} searchQuery={searchQuery} />
      )}
      {activeTab === "chatbot" && (
        <ChatbotCostTab isLoading={isLoading} chatData={chatData} searchQuery={searchQuery} />
      )}
      {activeTab === "ingestion" && (
        <IngestionCostTab isLoading={isLoading} ingestData={ingestData} searchQuery={searchQuery} />
      )}
    </div>
  );
}