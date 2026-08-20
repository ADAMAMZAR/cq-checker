"use client";

import { useEffect } from "react";
import { IconLock, IconX } from "@tabler/icons-react";
import { PortalModule } from "@/config/portalFeatures";

interface RestrictedAccessModalProps {
  item: PortalModule;
  onClose: () => void;
}

export default function RestrictedAccessModal({ item, onClose }: RestrictedAccessModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-[var(--bg-card)] border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close modal"
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
            <h3 id="modal-title" className="text-lg font-bold text-[var(--heading-color)] mt-2.5">
              {item.title}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed max-w-xs">
              You do not have permission to access this feature.
            </p>
          </div>

          <div className="mt-3 flex items-center justify-center gap-3 w-full">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:text-white border border-slate-700 hover:bg-slate-800 transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
