"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { AdminTab } from "@/components/AdminSidebar";
import AdminSidebar from "@/components/AdminSidebar";

import UserManagement from "@/components/UserManagement";
import DatabasePreview from "@/components/DatabasePreview";

const VALID_TABS: AdminTab[] = ["users", "database"];
const STORAGE_KEY = "admin_active_tab";

function AdminPageContent() {
  const searchParams = useSearchParams();

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

  // 1. Initial URL synchronization without triggering a full page reload or Next.js route transition
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const current = params.get("tab");
    if (current !== activeTab) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", activeTab);
      window.history.replaceState({ tab: activeTab }, "", url.toString());
    }
  }, [activeTab]);

  // 2. Handle browser Back/Forward navigation smoothly
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("tab");
      if (raw && VALID_TABS.includes(raw as AdminTab)) {
        const tab = raw as AdminTab;
        setActiveTab(tab);
        setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
        try {
          localStorage.setItem(STORAGE_KEY, tab);
        } catch {}
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 3. Tab switching: 0ms latency, zero reload, preserves mounted tab instances
  const handleTabChange = useCallback((newTab: AdminTab) => {
    setActiveTab(newTab);
    setVisitedTabs((prev) => (prev.has(newTab) ? prev : new Set(prev).add(newTab)));
    try {
      localStorage.setItem(STORAGE_KEY, newTab);
    } catch {}

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("tab") !== newTab) {
        url.searchParams.set("tab", newTab);
        window.history.pushState({ tab: newTab }, "", url.toString());
      }
    }
  }, []);

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
