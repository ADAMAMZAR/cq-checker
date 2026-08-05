"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { MainTab } from "@/components/SubNavTabs";
import type { DocumentEvidence } from "@/types";
import { fetchEvidenceLogs } from "@/lib/api";
import Header from "@/components/Header";
import SubNavTabs from "@/components/SubNavTabs";
import AuditRegistry from "@/components/AuditRegistry";
import LandingPage from "@/components/LandingPage";

const SupplierDataEditor = dynamic(() => import("@/components/SupplierDataEditor"), { ssr: false });
const CostAnalytics = dynamic(() => import("@/components/CostAnalytics"), { ssr: false });
const ComparisonPlayground = dynamic(() => import("@/components/ComparisonPlayground"), { ssr: false });
const SupplierAudit = dynamic(() => import("@/components/SupplierAudit"), { ssr: false });
const Chatbot = dynamic(() => import("@/components/Chatbot"), { ssr: false });
const DocumentIngest = dynamic(() => import("@/components/DocumentIngest"), { ssr: false });
const CertificateVerification = dynamic(() => import("@/components/CertificateVerification"), { ssr: false });
const DatabasePreview = dynamic(() => import("@/components/DatabasePreview"), { ssr: false });

export default function Dashboard() {
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("home");
  const [evidenceLogs, setEvidenceLogs] = useState<DocumentEvidence[]>([]);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [registrySupplier, setRegistrySupplier] = useState<string | null>(null);
  const evidenceFetched = useRef(false);

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
    if (!evidenceFetched.current) {
      evidenceFetched.current = true;
      loadEvidence();
    }
  }, [loadEvidence]);

  const handleRefresh = () => {
    setGlobalError(null);
    loadEvidence();
  };

  const handleGoHome = () => {
    setActiveMainTab("home");
  };

  const handleNavigateToRegistry = (supplierName: string) => {
    setRegistrySupplier(supplierName);
    setActiveMainTab("registry");
  };

  return (
    <div className="flex-1 flex flex-col w-full p-4 md:p-8">
      <Header
        error={globalError}
        isLoading={false}
        isEvidenceLoading={isEvidenceLoading}
        onRefresh={handleRefresh}
        onGoHome={handleGoHome}
      />

      {/* Hide SubNavTabs on Main Home page and Assistant page */}
      {activeMainTab !== "home" && activeMainTab !== "assistant" && (
        <SubNavTabs
          active={activeMainTab}
          onChange={setActiveMainTab}
          onGoHome={handleGoHome}
        />
      )}

      {activeMainTab === "home" && (
        <div className="flex-1 flex flex-col">
          <LandingPage onNavigate={setActiveMainTab} />
        </div>
      )}

      {activeMainTab === "assistant" && (
        <div className="flex-1 flex flex-col">
          <Chatbot onGoHome={handleGoHome} />
        </div>
      )}

      {activeMainTab === "chat" && (
        <div className="flex-1 flex flex-col">
          <Chatbot onGoHome={handleGoHome} />
        </div>
      )}

      {activeMainTab === "ingest" && (
        <div className="flex-1 flex flex-col">
          <DocumentIngest />
        </div>
      )}

      {activeMainTab === "verify" && (
        <div className="flex-1 flex flex-col">
          <CertificateVerification onNavigateToRegistry={handleNavigateToRegistry} />
        </div>
      )}

      {activeMainTab === "registry" && (
        <div className="flex-1 flex flex-col">
          <AuditRegistry
            evidenceLogs={evidenceLogs}
            isEvidenceLoading={isEvidenceLoading}
            onRefreshEvidence={loadEvidence}
            initialSupplier={registrySupplier}
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

      {activeMainTab === "database" && (
        <div className="flex-1 flex flex-col">
          <DatabasePreview />
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
