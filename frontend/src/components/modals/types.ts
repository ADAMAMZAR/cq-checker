import type { CostAnalyticsData } from "@/types";

export type CqCheckerCostData = NonNullable<CostAnalyticsData["cq_checker"]>;
export type ChatbotCostData = NonNullable<CostAnalyticsData["chatbot"]>;
export type IngestionCostData = NonNullable<CostAnalyticsData["ingestion"]>;
export type CostSubTab = "cq" | "chatbot" | "ingestion";

export interface MasterCostHeaderProps {
  masterMyr: number;
  masterUsd: number;
  cqData: CqCheckerCostData;
  chatData: ChatbotCostData;
  ingestData: IngestionCostData;
}

export interface CqCostTabProps {
  isLoading: boolean;
  cqData: CqCheckerCostData;
  searchQuery: string;
}

export interface ChatbotCostTabProps {
  isLoading: boolean;
  chatData: ChatbotCostData;
  searchQuery: string;
}

export interface IngestionCostTabProps {
  isLoading: boolean;
  ingestData: IngestionCostData;
  searchQuery: string;
}