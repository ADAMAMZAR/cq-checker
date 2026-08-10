"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconCoin,
  IconDatabase,
  IconSchema,
  IconPlaylist,
  IconUpload,
  IconArrowLeft,
  IconShield,
  IconMenu2,
  IconX,
  IconChevronRight,
  IconTable,
} from "@tabler/icons-react";
import type { AdminTab } from "./AdminTabs";

interface AdminSidebarProps {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
}

const tabs: { key: AdminTab; label: string; icon: typeof IconDatabase }[] = [
  { key: "database", label: "Database", icon: IconDatabase },
  { key: "matrix", label: "Comparison Matrix", icon: IconTable },
  { key: "costs", label: "Cost Analytics", icon: IconCoin },
  { key: "schema", label: "Schema", icon: IconSchema },
  { key: "playground", label: "Playground", icon: IconPlaylist },
  { key: "ingest", label: "Document Ingest", icon: IconUpload },
];

export default function AdminSidebar({ active, onChange }: AdminSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const expanded = !isCollapsed || isHovered;

  const handleSelectTab = (key: AdminTab) => {
    onChange(key);
    setIsCollapsed(true);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)]">
            <IconShield className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm text-[var(--heading-color)]">Admin Console</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg border border-[var(--border-visible)] text-[var(--text-secondary)] hover:text-[var(--heading-color)]"
          aria-label="Toggle Navigation Menu"
        >
          {mobileOpen ? <IconX className="w-5 h-5" /> : <IconMenu2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Container — fixed padding to eliminate icon movement */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`${
          mobileOpen ? "block" : "hidden"
        } md:flex flex-col shrink-0 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl h-fit md:min-h-[calc(100vh-2rem)] md:sticky md:top-4 p-3 transition-all duration-300 ease-in-out shadow-sm z-30 overflow-hidden ${
          expanded ? "w-full md:w-56" : "w-full md:w-[60px]"
        }`}
      >
        {/* Top Header Section */}
        <div className="w-full flex flex-col gap-2 pb-3 mb-3 border-b border-[var(--border-subtle)]">
          {/* Back to main link */}
          <Link
            href="/"
            className="flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-elevated-hover)] transition-colors group"
            title="Return to main operator dashboard"
          >
            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
              <IconArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </div>
            <span className={`truncate whitespace-nowrap transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0 w-0 pointer-events-none"}`}>
              Main Dashboard
            </span>
          </Link>

          {/* Admin console badge */}
          <div className="flex items-center gap-2.5 px-2.5 h-9">
            <div
              className="w-8 h-8 rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] shadow-xs shrink-0 flex items-center justify-center"
              title="Admin Console"
            >
              <IconShield className="w-4.5 h-4.5" />
            </div>
            <div className={`transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0 w-0 pointer-events-none"}`}>
              <h2 className="font-sans font-bold text-sm text-[var(--heading-color)] tracking-tight truncate whitespace-nowrap">
                Admin Console
              </h2>
            </div>
          </div>
        </div>

        {/* Navigation Group */}
        <div className="w-full flex-1 flex flex-col gap-1">
          {expanded && (
            <div className="px-2.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] font-mono transition-opacity duration-200">
              Navigation
            </div>
          )}
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectTab(key)}
                title={!expanded ? label : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 h-10 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-[var(--accent-primary-soft)] text-[var(--heading-color)] font-semibold border border-[var(--accent-primary-border)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--heading-color)] hover:bg-[var(--bg-elevated-hover)] border border-transparent"
                }`}
              >
                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${isActive ? "text-[var(--accent-primary-text)]" : "text-[var(--text-tertiary)]"}`} />
                </div>
                <span className={`text-xs font-semibold truncate whitespace-nowrap transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0 w-0 pointer-events-none"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Uncollapse Toggle Indicator at bottom when collapsed */}
        {!expanded && (
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="hidden md:flex items-center justify-center w-full h-8 mt-2 text-[var(--text-tertiary)] hover:text-[var(--heading-color)] transition-colors"
            title="Expand sidebar"
          >
            <IconChevronRight className="w-4 h-4" />
          </button>
        )}
      </aside>
    </>
  );
}
