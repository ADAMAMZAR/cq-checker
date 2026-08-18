"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  IconArrowRight,
  IconExternalLink,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";

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
    id: "strategic-insights",
    title: "Real-Time Strategic Insights",
    subtitle: "Executive Analytics",
    description: "Financial breakdown, cost impact analysis, and compliance cost metrics portal.",
    iconClass: "fa-solid fa-arrow-trend-up",
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "procurement-assistant",
    title: "Procurement Assistant",
    subtitle: "AI Assistant",
    description: "SAP Ariba Procurement Assistant for Vendor Onboarding and Sourcing.",
    iconClass: "fa-thin fa-robot fa-solid",
    anchor: "https://notebook.google.com/notebook/4bf27118-ca6c-413b-ba77-17b381d3679a?pli=1",
    isExternal: true,
    // anchor: "/assistant",
    // isExternal: false,
    // routePath: "/assistant",
  },
  {
    id: "supplier-visibility",
    title: "Real-Time Supplier Visibility",
    subtitle: "Vendor Intelligence",
    description: "Deep audit engine, certificate cross-checks, and real-time vendor risk monitoring.",
    iconClass: "fa-thin fa-eye fa-solid",
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "certificate-checker",
    title: "Certificate Checker",
    subtitle: "Audit Registry Engine",
    description: "Manage, update, and resolve supplier certificate data and audit findings.",
    iconClass: "fa-thin fa-certificate fa-solid",
    anchor: "https://chromewebstore.google.com/detail/lhcookcbhcmgbohajfncncpcihdjnjbo?utm_source=item-share-cb",
    isExternal: true,
    // anchor: "/checker/?tab=audit",
    // isExternal: false,
    // routePath: "/checker/?tab=audit",
  },
  {
    id: "e-auction-generator",
    title: "E-Auction Generator",
    subtitle: "Event Document Center",
    description: "Issue and generate official E-Auction Event Information documents & lot structures.",
    iconClass: "fa-thin fa-gavel fa-solid",
    anchor: "/auction",
    isExternal: false,
    routePath: "/auction",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const HERO_IMAGES = [
    "/hero/hero1.jpg",
    "/hero/hero2.jpg",
    "/hero/hero3.jpg",
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [HERO_IMAGES.length]);

  const handleContainerClick = (e: React.MouseEvent<HTMLAnchorElement>, item: PageContainerItem) => {
    if (!item.isExternal && item.routePath) {
      e.preventDefault();
      router.push(item.routePath);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-8 animate-fade-in w-full">
      {/* ── Hero Section (Full Width Edge-to-Edge) ── */}
      <section className="relative w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] -mx-4 md:-mx-8 -mt-2 overflow-hidden min-h-[300px] sm:min-h-[380px] flex items-center shadow-xl transition-all duration-300 bg-slate-900 px-6 sm:px-12 md:px-16 py-10 sm:py-14">
        {/* Rotating Background Images (Next.js Image Optimized) */}
        {HERO_IMAGES.map((src, index) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentImageIndex ? "opacity-100 scale-105 transition-transform duration-[7000ms]" : "opacity-0 scale-100"
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

        {/* Gradient Overlay for Text Legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30 z-10 pointer-events-none" />

        {/* Inner Content Container (Full Width Aligned) */}
        <div className="relative z-20 w-full flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-3xl flex flex-col items-start gap-4">
            {/* Main Title */}
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.1] drop-shadow-md">
              Operations Deck <br className="hidden sm:inline" />
              <span className="text-blue-400">
                Group Procurement Office
              </span>
            </h1>

            {/* Subtitle */}
            <p className="font-serif text-[13px] sm:text-[15px] md:text-base text-gray-200 leading-relaxed max-w-xl drop-shadow">
              Welcome to the Gamuda Group Procurement Office central portal for everything related to GPO operations.
            </p>
          </div>
        </div>
      </section>

      {/* ── 5 Main Page Containers Grid (Occupies Entire Width) ── */}
      <section className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
        {pageContainers.map((item) => {
          return (
            <a
              key={item.id}
              href={item.anchor}
              target={item.isExternal ? "_blank" : "_self"}
              rel={item.isExternal ? "noopener noreferrer" : undefined}
              onClick={(e) => handleContainerClick(e, item)}
              className="group relative flex flex-col justify-between p-5 sm:p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-visible)] hover:border-[var(--accent-primary-border-hover)] hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer no-underline overflow-hidden"
            >
              {/* Card Header Content */}
              <div className="relative z-10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  {/* Icon Badge */}
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border border-[var(--accent-primary-border)] group-hover:scale-105 group-hover:bg-[var(--accent-primary-soft-strong)] transition-all duration-300 shadow-sm">
                    <i className={item.iconClass} />
                  </div>
                </div>

                {/* Title & Tag */}
                <div className="flex flex-col gap-1 mt-1">
                  <h2 className="font-sans text-base sm:text-lg font-bold text-[var(--heading-color)] group-hover:text-[var(--accent-primary-text)] transition-colors leading-snug">
                    {item.title}
                  </h2>
                  <p className="font-serif text-[11px] sm:text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Click Here Button Bottom Anchor */}
              <div className="relative z-10 mt-5 pt-3 border-t border-[var(--border-subtle)]">
                <div className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-bold text-xs transition-all duration-200 shadow-md group-hover:shadow-[var(--accent-primary-shadow)] active:scale-95">
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
