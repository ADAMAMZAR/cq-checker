"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { AdminTab } from "@/components/AdminTabs";
import AdminSidebar from "@/components/AdminSidebar";

// Heavy admin components — dynamic imports keep the /admin route snappy.
const CostAnalytics = dynamic(() => import("@/components/CostAnalytics"), { ssr: false });
const DatabasePreview = dynamic(() => import("@/components/DatabasePreview"), { ssr: false });
const SchemaViewer = dynamic(() => import("@/components/SchemaViewer"), { ssr: false });
const ComparisonPlayground = dynamic(
  () => import("@/components/ComparisonPlayground"),
  { ssr: false }
);
const DocumentIngest = dynamic(() => import("@/components/DocumentIngest"), { ssr: false });
const ComparisonMatrix = dynamic(() => import("@/components/ComparisonMatrix"), { ssr: false });

const VALID_TABS: AdminTab[] = ["database", "matrix", "costs", "schema", "playground", "ingest"];
const STORAGE_KEY = "admin_active_tab";

function AdminPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<AdminTab>("database");
  const [isInitialized, setIsInitialized] = useState(false);

  // Synchronize active tab with URL query parameter & localStorage fallback
  useEffect(() => {
    const rawParam = searchParams.get("tab");
    const paramTab = rawParam && VALID_TABS.includes(rawParam as AdminTab) ? (rawParam as AdminTab) : null;

    if (paramTab) {
      setActiveTab(paramTab);
      try {
        localStorage.setItem(STORAGE_KEY, paramTab);
      } catch (err) {
        // Ignore localStorage quota/permission issues
      }
    } else {
      let savedTab: AdminTab | null = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && VALID_TABS.includes(stored as AdminTab)) {
          savedTab = stored as AdminTab;
        }
      } catch (err) {
        // Ignore localStorage errors
      }

      if (savedTab) {
        setActiveTab(savedTab);
        router.replace(`/admin?tab=${savedTab}`, { scroll: false });
      } else {
        setActiveTab("database");
      }
    }
    setIsInitialized(true);
  }, [searchParams, router]);

  const handleTabChange = useCallback(
    (newTab: AdminTab) => {
      setActiveTab(newTab);
      try {
        localStorage.setItem(STORAGE_KEY, newTab);
      } catch (err) {
        // Ignore localStorage errors
      }
      router.push(`/admin?tab=${newTab}`, { scroll: false });
    },
    [router]
  );

  return (
    <div className="flex-1 flex flex-col md:flex-row w-full p-2 md:p-4 gap-4 md:gap-5">
      {/* Left-Rail Sidebar Navigation */}
      <AdminSidebar active={activeTab} onChange={handleTabChange} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl p-3 md:p-5 shadow-xs">
        {activeTab === "database" && <DatabasePreview />}
        {activeTab === "matrix" && <ComparisonMatrix />}
        {activeTab === "costs" && <CostAnalytics />}
        {activeTab === "schema" && <SchemaViewer />}
        {activeTab === "playground" && <ComparisonPlayground />}
        {activeTab === "ingest" && <DocumentIngest />}
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-12 text-[var(--text-tertiary)]">
        Loading Admin Panel...
      </div>
    }>
      <AdminPageContent />
    </Suspense>
  );
}
