"use client";

import { useState, useEffect, useCallback } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { MainTab } from "@/components/SubNavTabs";
import type { DocumentEvidence } from "@/types";
import { fetchEvidenceLogs } from "@/lib/api";
import Header from "@/components/Header";
import SubNavTabs from "@/components/SubNavTabs";
import AuditRegistry from "@/components/AuditRegistry";
import SupplierDataEditor from "@/components/SupplierDataEditor";
import CostAnalytics from "@/components/CostAnalytics";
import ComparisonPlayground from "@/components/ComparisonPlayground";

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

  useEffect(() => { loadEvidence() }, [loadEvidence]);

  const handleRefresh = () => {
    setGlobalError(null);
    loadEvidence();
  };

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      <Header error={globalError} isLoading={false} isEvidenceLoading={isEvidenceLoading} onRefresh={handleRefresh} />
      <SubNavTabs active={activeMainTab} onChange={setActiveMainTab} />

      <div className={activeMainTab === "registry" ? "flex-1 flex flex-col" : "hidden"}>
        <AuditRegistry
          evidenceLogs={evidenceLogs}
          isEvidenceLoading={isEvidenceLoading}
          onRefreshEvidence={loadEvidence}
          onRefreshLogs={handleRefresh}
        />
      </div>

      <div className={activeMainTab === "editor" ? "flex-1 flex flex-col" : "hidden"}>
        <SupplierDataEditor
          evidenceLogs={evidenceLogs}
          isEvidenceLoading={isEvidenceLoading}
          onRefreshEvidence={loadEvidence}
          onRefreshLogs={handleRefresh}
        />
      </div>

      <div className={activeMainTab === "costs" ? "flex-1 flex flex-col" : "hidden"}>
        <CostAnalytics evidenceLogs={evidenceLogs} isEvidenceLoading={isEvidenceLoading} />
      </div>

      <div className={activeMainTab === "playground" ? "flex-1 flex flex-col" : "hidden"}>
        <ComparisonPlayground />
      </div>
    </div>
  );
}
