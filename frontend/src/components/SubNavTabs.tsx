"use client";

import { IconHome, IconFiles, IconEdit, IconCoin, IconPlaylist, IconSearch } from "@tabler/icons-react";

export type MainTab = "home" | "registry" | "editor" | "costs" | "playground" | "audit" | "assistant";

interface SubNavTabsProps {
  active: MainTab;
  onChange: (tab: MainTab) => void;
  onGoHome?: () => void;
}

const tabs: { key: MainTab; label: string; icon: typeof IconFiles }[] = [
  { key: "registry", label: "Audit Registry", icon: IconFiles },
  { key: "editor", label: "Supplier Data Editor", icon: IconEdit },
  { key: "costs", label: "Cost Analytics", icon: IconCoin },
  { key: "playground", label: "Playground", icon: IconPlaylist },
  { key: "audit", label: "Audit", icon: IconSearch },
];

export default function SubNavTabs({ active, onChange, onGoHome }: SubNavTabsProps) {
  return (
    <div className="flex items-center justify-between gap-6 mb-8 border-b border-white/5 pb-0.5">
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

      {onGoHome && (
        <button
          onClick={onGoHome}
          className="pb-3 px-2 text-xs font-semibold text-[var(--accent-success-text)] hover:text-[var(--accent-success-text-hover)] flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Return to Main Portal"
        >
          <IconHome className="h-3.5 w-3.5" />
          <span>Main Portal</span>
        </button>
      )}
    </div>
  );
}
