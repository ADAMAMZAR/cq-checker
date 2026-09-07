"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import type { AdminTab } from "@/components/AdminSidebar";
import AdminSidebar from "@/components/AdminSidebar";

import UserManagement from "@/components/UserManagement";
import DatabasePreview from "@/components/DatabasePreview";

const VALID_TABS: AdminTab[] = ["users", "database"];
const STORAGE_KEY = "admin_active_tab";

function AdminPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawParam = searchParams.get("tab");
  const paramTab = rawParam && VALID_TABS.includes(rawParam as AdminTab) ? (rawParam as AdminTab) : null;

  // Initialize synchronously with URL param or localStorage or default to "users"
  const getInitialTab = (): AdminTab => {
    if (paramTab) return paramTab;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && VALID_TABS.includes(stored as AdminTab)) return stored as AdminTab;
      } catch {}
    }
    return "users";
  };

  const [activeTab, setActiveTab] = useState<AdminTab>(getInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<AdminTab>>(() => new Set([getInitialTab()]));

  // Synchronize active tab with URL query parameter & localStorage fallback
  useEffect(() => {
    const raw = searchParams.get("tab");
    const validParam = raw && VALID_TABS.includes(raw as AdminTab) ? (raw as AdminTab) : null;

    if (validParam) {
      if (validParam !== activeTab) {
        setActiveTab(validParam);
        setVisitedTabs((prev) => (prev.has(validParam) ? prev : new Set(prev).add(validParam)));
      }
      try {
        localStorage.setItem(STORAGE_KEY, validParam);
      } catch {}
    } else {
      router.replace(`/admin?tab=${activeTab}`, { scroll: false });
    }
  }, [searchParams, router, activeTab]);

  const handleTabChange = useCallback(
    (newTab: AdminTab) => {
      setActiveTab(newTab);
      setVisitedTabs((prev) => (prev.has(newTab) ? prev : new Set(prev).add(newTab)));
      try {
        localStorage.setItem(STORAGE_KEY, newTab);
      } catch {}
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
        {visitedTabs.has("users") && (
          <div className={activeTab === "users" ? "flex-1 flex flex-col min-w-0 w-full" : "hidden"}>
            <UserManagement />
          </div>
        )}
        {visitedTabs.has("database") && (
          <div className={activeTab === "database" ? "flex-1 flex flex-col min-w-0 w-full" : "hidden"}>
            <DatabasePreview />
          </div>
        )}
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
