"use client";

import { IconFiles, IconEdit, IconCoin, IconPlaylist } from "@tabler/icons-react";

export type MainTab = "registry" | "editor" | "costs" | "playground";

interface SubNavTabsProps {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}

const tabs: { key: MainTab; label: string; icon: typeof IconFiles }[] = [
  { key: "registry", label: "Audit Registry", icon: IconFiles },
  { key: "editor", label: "Supplier Data Editor", icon: IconEdit },
  { key: "costs", label: "Cost Analytics", icon: IconCoin },
  { key: "playground", label: "Playground", icon: IconPlaylist },
];

export default function SubNavTabs({ active, onChange }: SubNavTabsProps) {
  return (
    <div className="flex gap-6 mb-8 border-b border-white/5 pb-0.5">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`pb-3 px-1 text-sm font-medium tracking-tight border-b-2 transition-all duration-300 ease-out cursor-pointer flex items-center gap-2 hover:text-[var(--heading-color)] active:scale-[0.97] ${
            active === key
              ? "border-emerald-500 text-[var(--heading-color)] font-semibold"
              : "border-transparent text-[var(--text-tertiary)]"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
