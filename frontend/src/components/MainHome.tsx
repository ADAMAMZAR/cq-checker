"use client";

import {
  IconHome,
  IconRobot,
  IconCertificate,
  IconReportAnalytics,
  IconBuildingStore,
  IconArrowRight,
  IconExternalLink,
  IconSparkles,
  IconActivity,
} from "@tabler/icons-react";
import type { MainTab } from "./SubNavTabs";

interface MainHomeProps {
  onNavigate: (tab: MainTab) => void;
}

interface PageContainerItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: typeof IconHome;
  anchor: string;
  isExternal: boolean;
  targetTab?: MainTab;
}

const pageContainers: PageContainerItem[] = [
  {
    id: "strategic-insights",
    title: "GPO - Real-Time Strategic Insights",
    subtitle: "Executive Analytics",
    description: "Financial breakdown, cost impact analysis, and compliance cost metrics portal.",
    icon: IconReportAnalytics,
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "procurement-assistant",
    title: "Autonomous Procurement Assistant",
    subtitle: "AI Assistant",
    description: "SAP Ariba Autonomous Procurement Assistant for Vendor Onboarding and Sourcing.",
    icon: IconRobot,
    anchor: "#assistant",
    isExternal: false,
    targetTab: "assistant",
  },
  {
    id: "supplier-visibility",
    title: "Real-Time Supplier Visibility",
    subtitle: "Vendor Intelligence",
    description: "Deep audit engine, certificate cross-checks, and real-time vendor risk monitoring.",
    icon: IconBuildingStore,
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "certificate-checker",
    title: "Certificate Checker",
    subtitle: "Audit Registry Engine",
    description: "Manage, update, and resolve supplier certificate data and audit findings.",
    icon: IconCertificate,
    anchor: "#registry",
    isExternal: false,
    targetTab: "registry",
  },
];

export default function MainHome({ onNavigate }: MainHomeProps) {
  const handleContainerClick = (e: React.MouseEvent<HTMLAnchorElement>, item: PageContainerItem) => {
    if (!item.isExternal && item.targetTab) {
      e.preventDefault();
      onNavigate(item.targetTab);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 py-2 animate-fade-in max-w-7xl mx-auto w-full">
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-6 sm:p-8 md:p-10 shadow-xl backdrop-blur-2xl transition-all duration-300">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-3xl flex flex-col items-start gap-4">
            {/* Main Title - Solid Blue Text */}
            <h1 className="font-sans text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-[var(--heading-color)] leading-[1.1]">
              Gamuda Group <br className="hidden sm:inline" />
              <span className="text-blue-500">
                Procurement Office
              </span>
            </h1>

            {/* Subtitle / Lead text using Serif pairing */}
            <p className="font-serif text-[12px] sm:text-[14px] md:text-base text-[var(--text-secondary)] leading-relaxed max-w-xl">
              Welcome to the Gamuda Group Procurement Office central portal for everything related to GPO operations.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4 Main Page Containers Grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {pageContainers.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.id}
              href={item.anchor}
              target={item.isExternal ? "_blank" : "_self"}
              rel={item.isExternal ? "noopener noreferrer" : undefined}
              onClick={(e) => handleContainerClick(e, item)}
              className="group relative flex flex-col justify-between p-5 sm:p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] hover:border-blue-500/50 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer no-underline overflow-hidden"
            >
              {/* Card Header Content */}
              <div className="relative z-10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  {/* Icon Badge */}
                  <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-105 group-hover:bg-blue-500/20 transition-all duration-300 shadow-sm">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>

                {/* Title & Tag */}
                <div className="flex flex-col gap-1 mt-1">
                  <h2 className="font-sans text-base sm:text-lg font-bold text-[var(--heading-color)] group-hover:text-blue-400 transition-colors leading-snug">
                    {item.title}
                  </h2>
                  <p className="font-serif text-[11px] sm:text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Click Here Button Bottom Anchor */}
              <div className="relative z-10 mt-5 pt-3 border-t border-[var(--border-subtle)]">
                <div className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all duration-200 shadow-md group-hover:shadow-blue-500/30 active:scale-95">
                  <span>Click Here</span>
                  {item.isExternal ? (
                    <IconExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  ) : (
                    <IconArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </section>
    </div>
  );
}
