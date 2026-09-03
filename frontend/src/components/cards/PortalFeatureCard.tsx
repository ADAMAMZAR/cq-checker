"use client";

import { IconArrowRight, IconExternalLink, IconLock } from "@tabler/icons-react";
import { PortalModule } from "@/config/portalFeatures";

interface PortalFeatureCardProps {
  item: PortalModule;
  isAllowed: boolean;
  onSelect: (item: PortalModule) => void;
}

export default function PortalFeatureCard({ item, isAllowed, onSelect }: PortalFeatureCardProps) {
  const { icon: Icon } = item;

  const cardContent = (
    <>
      {/* Card Header Content */}
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div
            className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all duration-300 shadow-sm ${isAllowed
              ? "bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)] border-[var(--accent-primary-border)] group-hover:scale-105"
              : "bg-red-500/10 text-red-500 border-red-500/30 group-hover:scale-105"
              }`}
          >
            <Icon className="w-5 h-5" />
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
      <div className="relative z-10 pt-3">
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
        <div className="absolute inset-0 bg-[var(--bg-card-solid)] z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center p-4 text-center pointer-events-none">
          <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-2">
            <IconLock className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-red-500">Access Restricted</span>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 max-w-[180px] leading-tight">
            You do not have permission to access this feature.
          </span>
        </div>
      )}
    </>
  );

  const baseStyles = `group relative flex flex-col justify-between p-5 sm:p-6 rounded-xl border transition-all duration-300 no-underline overflow-hidden text-left ${isAllowed
    ? "bg-[var(--bg-card)] border-[var(--border-visible)] hover:border-[var(--accent-primary-border-hover)] hover:shadow-xl transform hover:-translate-y-1 cursor-pointer"
    : "bg-[var(--bg-card)] border-red-500/30 hover:border-red-500/60 hover:shadow-lg transform hover:-translate-y-1 cursor-pointer"
    }`;

  if (!isAllowed) {
    return (
      <button onClick={() => onSelect(item)} className={baseStyles} type="button">
        {cardContent}
      </button>
    );
  }

  return (
    <a
      href={item.anchor}
      target={item.isExternal ? "_blank" : "_self"}
      rel={item.isExternal ? "noopener noreferrer" : undefined}
      onClick={(e) => {
        if (!item.isExternal && item.routePath) {
          e.preventDefault();
          onSelect(item);
        }
      }}
      className={baseStyles}
    >
      {cardContent}
    </a>
  );
}
