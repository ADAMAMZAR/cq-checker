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
  badge: string;
  tag: string;
  isExternal: boolean;
  targetTab?: MainTab;
}

const pageContainers: PageContainerItem[] = [
  {
    id: "procurement-assistant",
    title: "Autonomous Procurement Assistant",
    subtitle: "AI Assistant",
    description: "AI-powered procurement agent for compliance, evidence validation, and automated workflows.",
    icon: IconRobot,
    anchor: "https://notebook.google.com/notebook/4bf27118-ca6c-413b-ba77-17b381d3679a",
    badge: "Module 01",
    tag: "Notebook LM AI",
    isExternal: true,
  },
  {
    id: "certificate-checker",
    title: "Certificate Checker",
    subtitle: "Audit Registry Engine",
    description: "Manage, update, and resolve supplier certificate data and audit findings.",
    icon: IconCertificate,
    anchor: "#registry",
    badge: "Module 02",
    tag: "Internal System",
    isExternal: false,
    targetTab: "registry",
  },
  {
    id: "strategic-insights",
    title: "GPO - Real-Time Strategic Insights",
    subtitle: "Executive Analytics",
    description: "Financial breakdown, cost impact analysis, and compliance cost metrics portal.",
    icon: IconReportAnalytics,
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    badge: "Module 03",
    tag: "PowerBI Analytics",
    isExternal: true,
  },
  {
    id: "supplier-visibility",
    title: "Real-Time Supplier Visibility",
    subtitle: "Vendor Intelligence",
    description: "Deep audit engine, certificate cross-checks, and real-time vendor risk monitoring.",
    icon: IconBuildingStore,
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    badge: "Module 04",
    tag: "PowerBI Report",
    isExternal: true,
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
    <div className="flex-1 flex flex-col gap-10 py-2 animate-fade-in max-w-7xl mx-auto w-full">
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border-visible)] bg-[var(--bg-card)] p-8 sm:p-10 md:p-14 shadow-2xl backdrop-blur-2xl transition-all duration-300">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-3xl flex flex-col items-start gap-5">
            {/* Top Status Badge */}
            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <IconHome className="w-3.5 h-3.5" />
              Official Portal Gateway
            </div>

            {/* Main Title - Solid Blue Text */}
            <h1 className="font-sans text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--heading-color)] leading-[1.1]">
              Gamuda Group <br className="hidden sm:inline" />
              <span className="text-blue-500">
                Procurement Office
              </span>
            </h1>

            {/* Subtitle / Lead text using Serif pairing */}
            <p className="font-serif text-base sm:text-lg md:text-xl text-[var(--text-secondary)] italic leading-relaxed max-w-2xl">
              Welcome to the Gamuda Group Procurement Office central portal for everything related to GPO operations.
            </p>
          </div>

          {/* Quick Metrics / System Indicator Badge Box */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] backdrop-blur-md shrink-0 border-l-4 border-l-blue-500">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <IconActivity className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-sans text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  System Status
                </span>
                <span className="font-sans text-sm font-bold text-[var(--heading-color)] flex items-center gap-1.5">
                  Real-Time Sync Active
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 sm:pt-0 lg:pt-3 border-t sm:border-t-0 lg:border-t border-[var(--border-subtle)]">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <IconSparkles className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-sans text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  Connected Modules
                </span>
                <span className="font-sans text-sm font-bold text-[var(--heading-color)]">
                  4 Active Portals
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4 Main Page Containers Grid ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {pageContainers.map((item) => {
          const Icon = item.icon;

          return (
            <a
              key={item.id}
              href={item.anchor}
              target={item.isExternal ? "_blank" : "_self"}
              rel={item.isExternal ? "noopener noreferrer" : undefined}
              onClick={(e) => handleContainerClick(e, item)}
              className="group relative flex flex-col justify-between p-6 sm:p-7 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-visible)] hover:border-blue-500/50 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1.5 cursor-pointer no-underline overflow-hidden"
            >
              {/* Card Header Content */}
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  {/* Icon Badge */}
                  <div className="p-3.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all duration-300 shadow-sm">
                    <Icon className="w-6 h-6" />
                  </div>
                  {/* Module Badge */}
                  <span className="font-sans text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20 uppercase tracking-wider">
                    {item.badge}
                  </span>
                </div>

                {/* Title & Tag */}
                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                      {item.tag}
                    </span>
                  </div>
                  <h2 className="font-sans text-lg sm:text-xl font-bold text-[var(--heading-color)] group-hover:text-blue-400 transition-colors leading-snug">
                    {item.title}
                  </h2>
                  <p className="font-serif text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed mt-1">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Click Here Button Bottom Anchor */}
              <div className="relative z-10 mt-8 pt-4 border-t border-[var(--border-subtle)]">
                <div className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all duration-200 shadow-md group-hover:shadow-blue-500/30 active:scale-95">
                  <span>Click Here</span>
                  {item.isExternal ? (
                    <IconExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  ) : (
                    <IconArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
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
