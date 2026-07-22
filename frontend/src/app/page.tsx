"use client";

import { useState, useEffect, useCallback } from "react";
import type { MainTab } from "@/components/SubNavTabs";
import type { DocumentEvidence } from "@/types";
import { fetchEvidenceLogs } from "@/lib/api";
import Header from "@/components/Header";
import SubNavTabs from "@/components/SubNavTabs";
import AuditRegistry from "@/components/AuditRegistry";
import SupplierDataEditor from "@/components/SupplierDataEditor";
import CostAnalytics from "@/components/CostAnalytics";
import ComparisonPlayground from "@/components/ComparisonPlayground";
import SupplierAudit from "@/components/SupplierAudit";

let evidenceFetched = false;

export default function Dashboard() {
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("registry");
  const [evidenceLogs, setEvidenceLogs] = useState<DocumentEvidence[]>([]);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const loadEvidence = useCallback(async () => {
    setIsEvidenceLoading(true);
    try {
      const data = await fetchEvidenceLogs();
      setEvidenceLogs(data);
    } catch (err) {
      console.error("Failed to load document evidence logs:", err);
    } finally {
      setIsEvidenceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!evidenceFetched) {
      evidenceFetched = true;
      loadEvidence();
    }
  }, [loadEvidence]);

  const handleRefresh = () => {
    setGlobalError(null);
    loadEvidence();
  };

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      <Header error={globalError} isLoading={false} isEvidenceLoading={isEvidenceLoading} onRefresh={handleRefresh} />
      <SubNavTabs active={activeMainTab} onChange={setActiveMainTab} />

      {activeMainTab === "registry" && (
        <div className="flex-1 flex flex-col">
          <AuditRegistry
            evidenceLogs={evidenceLogs}
            isEvidenceLoading={isEvidenceLoading}
            onRefreshEvidence={loadEvidence}
            onRefreshLogs={handleRefresh}
          />
        </div>
      )}

      {activeMainTab === "editor" && (
        <div className="flex-1 flex flex-col">
          <SupplierDataEditor
            evidenceLogs={evidenceLogs}
            isEvidenceLoading={isEvidenceLoading}
            onRefreshEvidence={loadEvidence}
            onRefreshLogs={handleRefresh}
          />
        </div>
      )}

      {activeMainTab === "costs" && (
        <div className="flex-1 flex flex-col">
          <CostAnalytics />
        </div>
      )}

      {activeMainTab === "playground" && (
        <div className="flex-1 flex flex-col">
          <ComparisonPlayground />
        </div>
      )}

      {activeMainTab === "audit" && (
        <div className="flex-1 flex flex-col">
          <SupplierAudit evidenceLogs={evidenceLogs} isEvidenceLoading={isEvidenceLoading} />
        </div>
      )}
    </div>
  );
}
