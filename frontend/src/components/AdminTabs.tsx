"use client";

import Link from "next/link";
import {
  IconCoin,
  IconDatabase,
  IconSchema,
  IconPlaylist,
  IconUpload,
  IconArrowLeft,
  IconTable,
  IconFlask,
  IconSparkles,
} from "@tabler/icons-react";

export type AdminTab = "costs" | "database" | "schema" | "playground" | "ingest" | "ingest-test" | "matrix" | "retrieval";

interface AdminTabsProps {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
}

const tabs: { key: AdminTab; label: string; icon: typeof IconDatabase }[] = [
  { key: "database", label: "Database", icon: IconDatabase },
  { key: "retrieval", label: "Chunk Retrieval Test", icon: IconSparkles },
  { key: "matrix", label: "Comparison Matrix", icon: IconTable },
  { key: "costs", label: "Cost Analytics", icon: IconCoin },
  { key: "schema", label: "Schema", icon: IconSchema },
  { key: "playground", label: "Playground", icon: IconPlaylist },
  { key: "ingest", label: "Document Ingest", icon: IconUpload },
  { key: "ingest-test", label: "OCR Sandbox", icon: IconFlask },
];

/**
 * AdminTabs — internal tab strip for the /admin route.
 *
 * Mirrors the visual style of SubNavTabs but only contains the admin tools
 * (database inspection, cost analytics, schema viewer, RAG comparison
 * playground, and document ingestion). The "Back to main" link in the
 * header navigates back to the operator workflow.
 */
export default function AdminTabs({ active, onChange }: AdminTabsProps) {
  return (
    <div className="flex items-center justify-between gap-6 mb-8 border-b border-white/5 pb-0.5">
      <div className="flex items-center gap-4 overflow-x-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 pb-3 px-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--heading-color)] border-b-2 border-transparent transition-colors"
          title="Back to the operator dashboard"
        >
          <IconArrowLeft className="w-3.5 h-3.5" />
          Main
        </Link>
        <span className="pb-3 text-xs text-[var(--text-tertiary)]">/</span>
        <div className="flex items-center gap-2 pb-3 pr-2 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Admin
        </div>
        <div className="flex items-center gap-6 overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`pb-3 px-1 text-sm font-medium tracking-tight border-b-2 transition-all duration-300 ease-out cursor-pointer flex items-center gap-2 hover:text-[var(--heading-color)] active:scale-[0.97] ${
                active === key
                  ? "border-[var(--accent-success)] text-[var(--heading-color)] font-semibold"
                  : "border-transparent text-[var(--text-tertiary)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
