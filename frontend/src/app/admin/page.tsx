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

  // Initialize synchronously with URL param if present, or fallback
  const [activeTab, setActiveTab] = useState<AdminTab>(() => paramTab || "users");
  const [visitedTabs, setVisitedTabs] = useState<Set<AdminTab>>(() => new Set([paramTab || "users"]));
  const [isInitialized, setIsInitialized] = useState<boolean>(() => !!paramTab);

  // Synchronize active tab with URL query parameter & localStorage fallback
  useEffect(() => {
    const raw = searchParams.get("tab");
    const validParam = raw && VALID_TABS.includes(raw as AdminTab) ? (raw as AdminTab) : null;

    if (validParam) {
      setActiveTab(validParam);
      setVisitedTabs((prev) => (prev.has(validParam) ? prev : new Set(prev).add(validParam)));
      try {
        localStorage.setItem(STORAGE_KEY, validParam);
      } catch (err) {
        // Ignore localStorage quota/permission issues
      }
    } else {
      let savedTab: AdminTab = "users";
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && VALID_TABS.includes(stored as AdminTab)) {
          savedTab = stored as AdminTab;
        }
      } catch (err) {
        // Ignore localStorage errors
      }

      setActiveTab(savedTab);
      setVisitedTabs((prev) => (prev.has(savedTab) ? prev : new Set(prev).add(savedTab)));
      router.replace(`/admin?tab=${savedTab}`, { scroll: false });
    }
    setIsInitialized(true);
  }, [searchParams, router]);

  const handleTabChange = useCallback(
    (newTab: AdminTab) => {
      setActiveTab(newTab);
      setVisitedTabs((prev) => (prev.has(newTab) ? prev : new Set(prev).add(newTab)));
      try {
        localStorage.setItem(STORAGE_KEY, newTab);
      } catch (err) {
        // Ignore localStorage errors
      }
      router.push(`/admin?tab=${newTab}`, { scroll: false });
    },
    [router]
  );

  // If tab has not been determined yet (e.g. no URL param on cold visit), wait for localStorage resolution
  if (!isInitialized && !paramTab) {
    return (
      <div className="flex-1 flex flex-col md:flex-row w-full p-2 md:p-4 gap-4 md:gap-5">
        <AdminSidebar active="users" onChange={handleTabChange} />
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl p-8 items-center justify-center text-[var(--text-tertiary)] min-h-[400px]">
          <IconLoader2 className="w-5 h-5 animate-spin mb-2 text-[var(--accent-primary-text)]" />
          <span className="text-xs font-medium">Loading admin panel...</span>
        </main>
      </div>
    );
  }

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
