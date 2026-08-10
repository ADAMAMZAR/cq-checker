"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { MainTab } from "@/components/SubNavTabs";
import type { DocumentEvidence } from "@/types";
import { fetchEvidenceLogs } from "@/lib/api";
import Header from "@/components/Header";
import SubNavTabs from "@/components/SubNavTabs";

const SupplierDataEditor = dynamic(() => import("@/components/SupplierDataEditor"), { ssr: false });
const SupplierAudit = dynamic(() => import("@/components/SupplierAudit"), { ssr: false });
const AuditRegistry = dynamic(() => import("@/components/AuditRegistry"), { ssr: false });

const VALID_TABS: MainTab[] = ["audit", "registry", "editor"];
const STORAGE_KEY = "checker_active_tab";

function CheckerPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<MainTab>("audit");
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

  useEffect(() => {
    const rawParam = searchParams.get("tab");
    const paramTab = rawParam && VALID_TABS.includes(rawParam as MainTab) ? (rawParam as MainTab) : null;

    if (paramTab) {
      setActiveTab(paramTab);
      try {
        localStorage.setItem(STORAGE_KEY, paramTab);
      } catch (err) {
        // Ignore localStorage errors
      }
    } else {
      let savedTab: MainTab | null = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && VALID_TABS.includes(stored as MainTab)) {
          savedTab = stored as MainTab;
        }
      } catch (err) {
        // Ignore localStorage errors
      }

      if (savedTab) {
        setActiveTab(savedTab);
        router.replace(`/checker?tab=${savedTab}`, { scroll: false });
      } else {
        setActiveTab("audit");
      }
    }
  }, [searchParams, router]);

  const handleTabChange = useCallback(
    (newTab: MainTab) => {
      setActiveTab(newTab);
      try {
        localStorage.setItem(STORAGE_KEY, newTab);
      } catch (err) {
        // Ignore localStorage errors
      }
      router.push(`/checker?tab=${newTab}`, { scroll: false });
    },
    [router]
  );

  const handleRefresh = () => {
    setGlobalError(null);
    loadEvidence();
  };

  const handleGoHome = () => {
    router.push("/");
  };

  const handleNavigateToRegistry = (supplierName: string) => {
    setRegistrySupplier(supplierName);
    handleTabChange("registry");
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

      <SubNavTabs
        active={activeTab}
        onChange={handleTabChange}
        onGoHome={handleGoHome}
      />

      {activeTab === "audit" && (
        <div className="flex-1 flex flex-col">
          <SupplierAudit onNavigateToRegistry={handleNavigateToRegistry} />
        </div>
      )}
      {activeTab === "registry" && (
        <div className="flex-1 flex flex-col">
          <AuditRegistry
            evidenceLogs={evidenceLogs}
            isEvidenceLoading={isEvidenceLoading}
            onRefreshEvidence={loadEvidence}
            initialSupplier={registrySupplier}
          />
        </div>
      )}
      {activeTab === "editor" && (
        <div className="flex-1 flex flex-col">
          <SupplierDataEditor
            evidenceLogs={evidenceLogs}
            isEvidenceLoading={isEvidenceLoading}
            onRefreshEvidence={loadEvidence}
            onRefreshLogs={handleRefresh}
          />
        </div>
      )}
    </div>
  );
}

export default function CheckerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-12 text-[var(--text-tertiary)]">
          Loading Certificate Checker...
        </div>
      }
    >
      <CheckerPageContent />
    </Suspense>
  );
}
