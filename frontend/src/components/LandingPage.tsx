"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  IconArrowRight,
  IconExternalLink,
  IconLock,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import {
  getStoredRoleName,
  isFeatureAllowedForRole,
  ROLE_CHANGED_EVENT,
  DEFAULT_ROLES,
  fetchRolesAndFeaturesCached,
  mergeRoles,
} from "@/lib/roleStore";
import { RoleInfo } from "@/types";

interface PageContainerItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  iconClass: string;
  anchor: string;
  isExternal: boolean;
  routePath?: string;
}

const pageContainers: PageContainerItem[] = [
  {
    id: "strategic_insights",
    title: "Real-Time Strategic Insights",
    subtitle: "Executive Analytics",
    description: "Financial breakdown, cost impact analysis, and compliance cost metrics portal.",
    iconClass: "fa-solid fa-arrow-trend-up",
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "procurement_assistant",
    title: "Procurement Assistant",
    subtitle: "AI Assistant",
    description: "SAP Ariba Procurement Assistant for Vendor Onboarding and Sourcing.",
    iconClass: "fa-thin fa-robot fa-solid",
    anchor: "https://notebook.google.com/notebook/4bf27118-ca6c-413b-ba77-17b381d3679a?pli=1",
    isExternal: true,
  },
  {
    id: "supplier_visibility",
    title: "Real-Time Supplier Visibility",
    subtitle: "Vendor Intelligence",
    description: "Deep audit engine, certificate cross-checks, and real-time vendor risk monitoring.",
    iconClass: "fa-thin fa-eye fa-solid",
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "certificate_checker",
    title: "Certificate Checker",
    subtitle: "Audit Registry Engine",
    description: "Manage, update, and resolve supplier certificate data and audit findings.",
    iconClass: "fa-thin fa-certificate fa-solid",
    anchor: "https://chromewebstore.google.com/detail/lhcookcbhcmgbohajfncncpcihdjnjbo?utm_source=item-share-cb",
    isExternal: true,
  },
  {
    id: "e_auction_generator",
    title: "E-Auction Generator",
    subtitle: "Event Document Center",
    description: "Issue and generate official E-Auction Event Information documents & lot structures.",
    iconClass: "fa-thin fa-gavel fa-solid",
    anchor: "/auction",
    isExternal: false,
    routePath: "/auction",
  },
];

const HERO_IMAGES = [
  "/hero/hero1.jpg",
  "/hero/hero2.jpg",
  "/hero/hero3.jpg",
];

export default function LandingPage() {
  const router = useRouter();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeRoleName, setActiveRoleName] = useState<string>("all");
  const [roles, setRoles] = useState<RoleInfo[]>(DEFAULT_ROLES);
  const [restrictedModalItem, setRestrictedModalItem] = useState<PageContainerItem | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % HERO_IMAGES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setActiveRoleName(getStoredRoleName());

    async function loadRoles() {
      try {
        const res = await fetchRolesAndFeaturesCached();
        if (res?.roles && res.roles.length > 0) {
          setRoles(mergeRoles(res.roles));
        }
      } catch {
        // use default static roles
      }
    }
    loadRoles();

    const handleRoleChange = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail?.roleName) {
        setActiveRoleName(customEv.detail.roleName);
      }
    };

    window.addEventListener(ROLE_CHANGED_EVENT, handleRoleChange);
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, handleRoleChange);
  }, []);

  const handleContainerClick = (e: React.MouseEvent<HTMLAnchorElement>, item: PageContainerItem) => {
    const isAllowed = isFeatureAllowedForRole(item.id, activeRoleName, roles);

    if (!isAllowed) {
      e.preventDefault();
      setRestrictedModalItem(item);
      return;
    }

    if (!item.isExternal && item.routePath) {
      e.preventDefault();
      router.push(item.routePath);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fade-in w-full pb-10">
      {/* ── Hero Section (Full Width Edge-to-Edge) ── */}
      <section className="relative w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] -mx-4 md:-mx-8 -mt-2 overflow-hidden min-h-[280px] sm:min-h-[340px] flex items-center shadow-xl bg-slate-900 px-6 sm:px-12 md:px-16 py-8 sm:py-12">
        {/* Rotating Background Images */}
        {HERO_IMAGES.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${index === currentImageIndex ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
          >
            <Image
              src={src}
              alt="Hero slide background"
              fill
              priority={index === 0}
              sizes="100vw"
              className="object-cover object-center"
            />
          </div>
        ))}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30 z-10 pointer-events-none" />

        {/* Inner Content */}
        <div className="relative z-20 w-full flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-3xl flex flex-col items-start gap-3">
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.1] drop-shadow-md">
              Operations Deck <br className="hidden sm:inline" />
              <span className="text-blue-400">Group Procurement Office</span>
            </h1>
            <p className="font-serif text-[13px] sm:text-[15px] md:text-base text-gray-200 leading-relaxed max-w-xl drop-shadow">
              Welcome to the Gamuda Group Procurement Office central portal for everything related to GPO operations.
            </p>
          </div>
        </div>
      </section>

      {/* ── 5 Main Page Containers Grid ── */}
      <section className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        {pageContainers.map((item) => {
          const isAllowed = isFeatureAllowedForRole(item.id, activeRoleName, roles);

          return (
            <a
              key={item.id}
              href={item.anchor}
              target={item.isExternal ? "_blank" : "_self"}
              rel={item.isExternal ? "noopener noreferrer" : undefined}
              onClick={(e) => handleContainerClick(e, item)}
              className={`group relative flex flex-col justify-between p-5 sm:p-6 rounded-xl border transition-all duration-300 no-underline overflow-hidden ${isAllowed
                ? "bg-[var(--bg-card)] border-[var(--border-visible)] hover:border-[var(--accent-primary-border-hover)] hover:shadow-xl transform hover:-translate-y-1 cursor-pointer"
                : "bg-[var(--bg-card)] border-red-500/30 hover:border-red-500/60 hover:shadow-lg transform hover:-translate-y-1 cursor-pointer"
                }`}
            >
              {/* Card Header Content */}
              <div className="relative z-10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  {/* Icon Badge */}
                  <div
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-300 shadow-sm ${isAllowed
                      ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)] group-hover:scale-105"
                      : "bg-red-500/10 text-red-500 border-red-500/30 group-hover:scale-105"
                      }`}
                  >
                    <i className={item.iconClass} />
                  </div>
                </div>

                {/* Title & Description */}
                <div className="flex flex-col gap-1 mt-1">
                  <h2
                    className={`font-sans text-base sm:text-lg font-bold leading-snug transition-colors ${isAllowed
                      ? "text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)]"
                      : "text-[var(--heading-color)] group-hover:text-red-500"
                      }`}
                  >
                    {item.title}
                  </h2>
                  <p className="font-serif text-[11px] sm:text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Button CTA */}
              <div className="relative z-10 mt-5 pt-3 border-t border-[var(--border-subtle)]">
                {isAllowed ? (
                  <div className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-bold text-xs transition-all duration-200 shadow-md group-hover:shadow-[var(--accent-primary-shadow)] active:scale-95">
                    <span>Click Here</span>
                    {item.isExternal ? (
                      <IconExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    ) : (
                      <IconArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    )}
                  </div>
                ) : (
                  <div className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-500 font-bold text-xs border border-red-500/30 group-hover:bg-red-500/20 transition-all shadow-sm">
                    <IconLock className="w-3.5 h-3.5" />
                    <span>Restricted Access</span>
                  </div>
                )}
              </div>

              {/* Hover Overlay for Restricted Features */}
              {!isAllowed && (
                <div className="absolute inset-0 bg-[var(--bg-card-solid)]/95 backdrop-blur-[2px] z-30 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center p-4 text-center pointer-events-none">
                  <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-2">
                    <IconLock className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-red-500">Access Restricted</span>
                  <span className="text-[11px] text-[var(--text-secondary)] mt-1 max-w-[180px] leading-tight">You cannot access this features.</span>
                </div>
              )}
            </a>
          );
        })}
      </section>

      {/* ── Restricted Access Modal ── */}
      {restrictedModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[var(--bg-card)] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setRestrictedModalItem(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <IconX className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-1">
                <IconLock className="w-6 h-6" />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 px-2.5 py-1 rounded-full bg-red-950/60 border border-red-800/60">
                  Access Restricted
                </span>
                <h3 className="text-lg font-bold text-[var(--heading-color)] mt-2.5">
                  {restrictedModalItem.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed max-w-xs">
                  You are restricted to access this feature.
                </p>
              </div>

              <div className="mt-3 flex items-center justify-center gap-3 w-full">
                <button
                  onClick={() => setRestrictedModalItem(null)}
                  className="px-5 py-2 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:text-white border border-slate-700 hover:bg-slate-800 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
